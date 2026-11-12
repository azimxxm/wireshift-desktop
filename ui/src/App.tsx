import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Sidebar, TabId } from "./components/Sidebar";
import { TransferView, ExportScope } from "./components/TransferView";
import { MediaExplorer } from "./components/MediaExplorer";
import { CableSpeedView } from "./components/CableSpeedView";
import { DiagnosticsView } from "./components/DiagnosticsView";
import { SettingsView } from "./components/SettingsView";
import { AboutModal } from "./components/AboutModal";
import { ImportView, ImportBusyState } from "./components/ImportView";
import { WifiView } from "./components/wifi/WifiView";
import {
  ConnectedDevice,
  SystemStatus,
  ExportProgress,
  MediaCatalogSummary,
  MediaItem,
} from "./types";
import { useSettings } from "./hooks/useSettings";
import { sidecarKey } from "./utils/format";

export interface ExportResult {
  copied: number;
  skipped: number;
}

const formatEta = (secs: number) =>
  secs > 60 ? `${Math.floor(secs / 60)} daq ${secs % 60} s` : `${secs} s`;

export function App() {
  const [currentTab, setCurrentTab] = useState<TabId>("transfer");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [sourceUdid, setSourceUdid] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const { settings, update: updateSetting } = useSettings();
  const exportPath = settings.exportPath;
  const setExportPath = (p: string) => updateSetting("exportPath", p);

  // Media catalog (everything in DCIM)
  const [catalog, setCatalog] = useState<MediaCatalogSummary | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);

  // Export progress
  const [isExporting, setIsExporting] = useState(false);
  const isExportingRef = useRef(false);
  isExportingRef.current = isExporting;
  const [progress, setProgress] = useState(0);
  const [speedText, setSpeedText] = useState("");
  const [etaText, setEtaText] = useState("");
  const [copiedCount, setCopiedCount] = useState(0);
  const [copiedBytes, setCopiedBytes] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // Mac -> iPhone import (state lives in ImportView, this mirrors it for the sidebar)
  const [importBusy, setImportBusy] = useState<ImportBusyState>({
    active: false,
    progress: 0,
    label: "",
  });
  const isImportingRef = useRef(false);
  isImportingRef.current = importBusy.active;

  const refreshDevices = async () => {
    setIsRefreshing(true);
    try {
      if (sourceUdid) await invoke("refresh_device", { udid: sourceUdid });
      const list = await invoke<ConnectedDevice[]>("get_connected_devices");
      setDevices(list);
      if (list.length >= 1 && !list.some((d) => d.udid === sourceUdid))
        setSourceUdid(list[0].udid);
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    invoke<SystemStatus>("check_system_status")
      .then(setSystemStatus)
      .catch(console.error);
    if (!exportPath) {
      invoke<string>("get_default_export_dir")
        .then((dir) => dir && setExportPath(dir))
        .catch(console.error);
    }
    refreshDevices();

    // Poll every 3 s; keep the same array reference when nothing changed (no re-render)
    const interval = setInterval(async () => {
      // avoid USB contention while copying
      if (isExportingRef.current || isImportingRef.current) return;
      try {
        const list = await invoke<ConnectedDevice[]>("get_connected_devices");
        setDevices((prev) => {
          const same =
            prev.length === list.length &&
            prev.every((d, i) => {
              const n = list[i];
              return (
                d.udid === n.udid &&
                d.is_trusted === n.is_trusted &&
                d.battery?.charge_percent === n.battery?.charge_percent &&
                d.battery?.is_charging === n.battery?.is_charging &&
                d.storage?.available_bytes === n.storage?.available_bytes
              );
            });
          return same ? prev : list;
        });
      } catch (e) {
        console.debug("Polling check:", e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const sourceDevice =
    devices.find((d) => d.udid === sourceUdid) || devices[0] || null;

  useEffect(() => {
    if (!sourceUdid && devices.length > 0) setSourceUdid(devices[0].udid);
  }, [devices, sourceUdid]);

  const loadMediaCatalog = async (udid?: string) => {
    const id = udid || sourceDevice?.udid;
    if (!id) return;
    setIsCatalogLoading(true);
    try {
      setCatalog(
        await invoke<MediaCatalogSummary>("fetch_media_catalog", { udid: id }),
      );
    } catch (err) {
      console.error("Failed to load media catalog:", err);
    } finally {
      setIsCatalogLoading(false);
    }
  };

  // Export and gallery pages both need the catalog
  useEffect(() => {
    if (
      (currentTab === "media" || currentTab === "transfer" || currentTab === "cable") &&
      !catalog &&
      !isCatalogLoading &&
      sourceDevice?.is_trusted
    ) {
      loadMediaCatalog(sourceDevice.udid);
    }
  }, [currentTab, sourceDevice?.udid, sourceDevice?.is_trusted]);

  // A different (or no) phone -> forget the old catalog
  useEffect(() => {
    setCatalog(null);
    setExportResult(null);
  }, [sourceDevice?.udid]);

  // ⌘1-6 pages (sidebar order), ⌘, settings, ⌘R rescan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      const tabs: Record<string, TabId> = {
        "1": "transfer",
        "2": "import",
        "3": "wifi",
        "4": "media",
        "5": "cable",
        "6": "diagnostics",
        ",": "settings",
      };
      if (tabs[e.key]) {
        e.preventDefault();
        setCurrentTab(tabs[e.key]);
      } else if (e.key === "r" && !e.shiftKey) {
        e.preventDefault();
        if (currentTab === "media" || currentTab === "transfer")
          loadMediaCatalog();
        if (currentTab !== "media") refreshDevices();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const handlePickExportFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: exportPath || undefined,
        title: "Fayllarni saqlash papkasini tanlang",
      });
      if (selected && typeof selected === "string") setExportPath(selected);
    } catch (err) {
      console.error("Folder picker error:", err);
    }
  };

  const handleOpenExportFolder = useCallback(async () => {
    try {
      await invoke("open_folder_in_finder", { path: exportPath });
    } catch (err) {
      console.error("Open folder error:", err);
    }
  }, [exportPath]);

  /** Photos' .AAE edit files travel with their photo when the setting is on */
  const withSidecars = (items: MediaItem[]): MediaItem[] => {
    if (!settings.includeSidecars || !catalog) return items;
    const byKey = new Map<string, MediaItem>();
    catalog.items.forEach(
      (i) => i.kind === "sidecar" && byKey.set(sidecarKey(i.album, i.name), i),
    );
    const out = [...items];
    const seen = new Set(items.map((i) => i.path));
    items.forEach((i) => {
      if (i.kind !== "photo") return;
      const aae = byKey.get(sidecarKey(i.album, i.name));
      if (aae && !seen.has(aae.path)) {
        out.push(aae);
        seen.add(aae.path);
      }
    });
    return out;
  };

  /** One export path for everything: optional skip of already-saved files, then copy with live progress. */
  const runExport = async (items: MediaItem[], keepAlbums: boolean) => {
    if (!sourceDevice || items.length === 0 || isExportingRef.current) return;
    let targetDir = exportPath;
    if (!targetDir) {
      targetDir = await invoke<string>("get_default_export_dir").catch(
        () => "~/Pictures/WireShift_Exports",
      );
      setExportPath(targetDir);
    }

    setIsExporting(true);
    setExportResult(null);
    setProgress(0);
    setSpeedText("");
    setEtaText("");
    setCopiedCount(0);
    setCopiedBytes(0);

    let progressTimer: ReturnType<typeof setInterval> | undefined;
    try {
      let todo = items;
      if (settings.skipExisting) {
        const fresh = new Set(
          await invoke<string[]>("filter_new_files", {
            destinationDir: targetDir,
            items: items.map((i) => [i.path, i.size_bytes]),
            keepAlbums,
          }),
        );
        todo = items.filter((i) => fresh.has(i.path));
      }
      const skipped = items.length - todo.length;
      if (todo.length === 0) {
        setExportResult({ copied: 0, skipped });
        return;
      }

      const totalBytes = todo.reduce((acc, i) => acc + i.size_bytes, 0) || 1;
      setTotalCount(todo.length);

      // Files already in the folder must not count as progress
      const baseline = await invoke<ExportProgress>("get_export_progress", {
        destinationDir: targetDir,
      }).catch(() => ({
        copied_files: 0,
        copied_bytes: 0,
        current_album: "",
      }));
      const startTime = Date.now();
      progressTimer = setInterval(async () => {
        try {
          const prog = await invoke<ExportProgress>("get_export_progress", {
            destinationDir: targetDir,
          });
          const bytes = Math.max(prog.copied_bytes - baseline.copied_bytes, 0);
          setCopiedBytes(bytes);
          setCopiedCount(
            Math.min(
              Math.max(prog.copied_files - baseline.copied_files, 0),
              todo.length,
            ),
          );
          setProgress(Math.min(Math.round((bytes / totalBytes) * 100), 99));
          const mbPerSec =
            bytes /
            (1024 * 1024) /
            Math.max((Date.now() - startTime) / 1000, 0.5);
          if (mbPerSec > 0.5) {
            setSpeedText(`${mbPerSec.toFixed(1)} MB/s`);
            setEtaText(
              formatEta(
                Math.round(
                  Math.max(totalBytes - bytes, 0) / (mbPerSec * 1024 * 1024),
                ),
              ),
            );
          }
        } catch (e) {
          console.debug("Progress poll error:", e);
        }
      }, 500);

      await invoke("export_selected_media", {
        udid: sourceDevice.udid,
        destinationDir: targetDir,
        paths: todo.map((i) => i.path),
        keepAlbums,
      });
      setProgress(100);
      setExportResult({ copied: todo.length, skipped });
      if (settings.openFinderAfterExport) handleOpenExportFolder();
    } catch (err) {
      console.error("Export error:", err);
      // cancel also lands here; only report real failures
      if (isExportingRef.current)
        alert("Eksport jarayonida xatolik yuz berdi: " + err);
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsExporting(false);
    }
  };

  const handleCancelExport = async () => {
    setIsExporting(false);
    isExportingRef.current = false;
    setProgress(0);
    try {
      await invoke("cancel_export");
    } catch (e) {
      console.debug("Cancel export error:", e);
    }
  };

  const handleExportScope = (scope: ExportScope) => {
    if (!catalog) return;
    const picked = catalog.items.filter((i) =>
      scope === "video"
        ? i.kind === "video"
        : scope === "photo"
          ? i.kind === "photo"
          : i.kind !== "sidecar",
    );
    runExport(withSidecars(picked), true);
  };

  const handleExportSelectedMedia = async (paths: string[]) => {
    if (!catalog) return;
    const set = new Set(paths);
    await runExport(
      withSidecars(catalog.items.filter((i) => set.has(i.path))),
      false,
    );
  };

  const progressLabel = `Ko'chirilmoqda · ${progress}%${speedText ? ` · ${speedText}` : ""}`;

  return (
    <div className="flex h-screen text-white overflow-hidden">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenAbout={() => setIsAboutOpen(true)}
        onRefresh={refreshDevices}
        isRefreshing={isRefreshing}
        devices={devices}
        activeUdid={sourceDevice?.udid}
        onSelectDevice={setSourceUdid}
        isMigrating={isExporting || importBusy.active}
        progress={importBusy.active ? importBusy.progress : progress}
        progressLabel={importBusy.active ? importBusy.label : progressLabel}
        onCancel={
          importBusy.active
            ? () => invoke("cancel_import").catch(console.debug)
            : handleCancelExport
        }
        progressTab={importBusy.active ? "import" : "transfer"}
      />

      <main className="ws-main flex-1 min-w-0 flex flex-col">
        {currentTab === "transfer" && (
          <TransferView
            device={sourceDevice}
            devices={devices}
            onSelectDevice={setSourceUdid}
            exportPath={exportPath}
            onPickExportPath={handlePickExportFolder}
            onOpenFolder={handleOpenExportFolder}
            catalog={catalog}
            isCatalogLoading={isCatalogLoading}
            skipExisting={settings.skipExisting}
            onSkipExistingChange={(v) => updateSetting("skipExisting", v)}
            onStart={handleExportScope}
            onCancel={handleCancelExport}
            isExporting={isExporting}
            exportResult={exportResult}
            progress={progress}
            speedText={speedText}
            etaText={etaText}
            copiedCount={copiedCount}
            totalCount={totalCount}
            copiedBytes={copiedBytes}
            onOpenGallery={() => setCurrentTab("media")}
            onOpenCableSpeed={() => setCurrentTab("cable")}
          />
        )}

        {/* always mounted: an import keeps running while you look at other pages */}
        <div
          className={
            currentTab === "import" ? "flex-1 min-h-0 flex flex-col" : "hidden"
          }
        >
          <ImportView
            device={sourceDevice}
            devices={devices}
            onSelectDevice={setSourceUdid}
            isVisible={currentTab === "import"}
            preferredApp={settings.importApp}
            onPreferredAppChange={(v) => updateSetting("importApp", v)}
            onBusyChange={setImportBusy}
          />
        </div>

        {/* mounted only while visible: its Finder drop listener must not compete with ImportView */}
        {currentTab === "wifi" && <WifiView exportPath={exportPath} />}

        {currentTab === "media" && (
          <MediaExplorer
            catalog={catalog}
            isLoading={isCatalogLoading}
            hasDevice={!!sourceDevice}
            onRefreshCatalog={() => loadMediaCatalog()}
            destinationDir={exportPath}
            onExportSelected={handleExportSelectedMedia}
            isExporting={isExporting}
            exportProgress={progress}
            exportResult={exportResult}
            onOpenFolder={handleOpenExportFolder}
            onCancelExport={handleCancelExport}
            udid={sourceDevice?.udid}
            thumbSize={settings.thumbSize}
            onThumbSizeChange={(v) => updateSetting("thumbSize", v)}
          />
        )}

        {currentTab === "cable" && (
          <CableSpeedView device={sourceDevice} catalog={catalog} />
        )}

        {currentTab === "diagnostics" && (
          <DiagnosticsView
            device={sourceDevice}
            onRefresh={refreshDevices}
            isRefreshing={isRefreshing}
          />
        )}

        {currentTab === "settings" && (
          <SettingsView
            settings={settings}
            onUpdate={updateSetting}
            onPickExportPath={handlePickExportFolder}
            onOpenFolder={handleOpenExportFolder}
            status={systemStatus}
          />
        )}
      </main>

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        status={systemStatus}
      />
    </div>
  );
}

export default App;
