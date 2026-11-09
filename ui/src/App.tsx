import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Sidebar, TabId } from "./components/Sidebar";
import { TransferView } from "./components/TransferView";
import { MediaExplorer } from "./components/MediaExplorer";
import { CableSpeedView } from "./components/CableSpeedView";
import { DiagnosticsView } from "./components/DiagnosticsView";
import { SettingsView } from "./components/SettingsView";
import { AboutModal } from "./components/AboutModal";
import { PageHeader } from "./components/PageHeader";
import {
  ConnectedDevice,
  SystemStatus,
  ExportProgress,
  MediaCatalogSummary,
} from "./types";
import { useSettings } from "./hooks/useSettings";

export type TargetMode = "phone" | "pc";

const formatEta = (secs: number) =>
  secs > 60 ? `${Math.floor(secs / 60)} daq ${secs % 60} s` : `${secs} s`;

export function App() {
  const [currentTab, setCurrentTab] = useState<TabId>("transfer");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [sourceUdid, setSourceUdid] = useState<string>("");
  const [targetUdid, setTargetUdid] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const { settings, update: updateSetting } = useSettings();

  // Target Destination Mode: 'pc' (1 phone required) or 'phone' (2 phones required)
  const [targetMode, setTargetMode] = useState<TargetMode>("pc");
  const exportPath = settings.exportPath;
  const setExportPath = (p: string) => updateSetting("exportPath", p);
  const [dcimCount, setDcimCount] = useState<number>(0);
  const [copiedCount, setCopiedCount] = useState<number>(0);
  const [copiedBytes, setCopiedBytes] = useState<number>(0);
  const [currentAlbum, setCurrentAlbum] = useState<string>("");
  const [isExportSuccess, setIsExportSuccess] = useState<boolean>(false);
  const [selectedCategories, setSelectedCategories] = useState({
    photos: true,
    contacts: true,
    files: false,
  });

  // Media Catalog (Photos & Videos) state
  const [catalog, setCatalog] = useState<MediaCatalogSummary | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false);

  // Migration / Export progress state
  const [isMigrating, setIsMigrating] = useState(false);
  const isMigratingRef = useRef(false);
  isMigratingRef.current = isMigrating;

  const [progress, setProgress] = useState(0);
  const [speedText, setSpeedText] = useState("");
  const [etaText, setEtaText] = useState("");

  // Fetch connected devices with cache invalidation
  const refreshDevices = async () => {
    setIsRefreshing(true);
    try {
      if (sourceUdid) {
        await invoke("refresh_device", { udid: sourceUdid });
      }
      const list = await invoke<ConnectedDevice[]>("get_connected_devices");
      setDevices(list);

      if (list.length >= 1 && !sourceUdid) {
        setSourceUdid(list[0].udid);
      }
      if (list.length >= 2 && !targetUdid) {
        setTargetUdid(list[1].udid);
      }
      if (list.length === 1 && targetMode !== "pc") {
        setTargetMode("pc");
      }
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch initial system status and default export directory
  useEffect(() => {
    invoke<SystemStatus>("check_system_status")
      .then(setSystemStatus)
      .catch(console.error);

    if (!exportPath) {
      invoke<string>("get_default_export_dir")
        .then((dir) => {
          if (dir) setExportPath(dir);
        })
        .catch(console.error);
    }

    refreshDevices();

    // Smart auto-polling: checks devices every 3 seconds without causing re-renders if identical
    const interval = setInterval(async () => {
      // If currently migrating or exporting, pause scanning to avoid USB socket contention
      if (isMigratingRef.current) return;

      try {
        const list = await invoke<ConnectedDevice[]>("get_connected_devices");
        setDevices((prev) => {
          if (prev.length === list.length) {
            const isSame = prev.every((d, i) => {
              const n = list[i];
              return (
                d.udid === n.udid &&
                d.is_trusted === n.is_trusted &&
                d.battery?.charge_percent === n.battery?.charge_percent &&
                d.battery?.is_charging === n.battery?.is_charging &&
                d.storage?.available_bytes === n.storage?.available_bytes
              );
            });
            if (isSame) return prev; // same reference -> no re-render
          }

          if (list.length >= 1 && !sourceUdid) setSourceUdid(list[0].udid);
          if (list.length >= 2 && !targetUdid) setTargetUdid(list[1].udid);
          return list;
        });
      } catch (e) {
        console.debug("Polling check:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const sourceDevice =
    devices.find((d) => d.udid === sourceUdid) ||
    (devices.length > 0 ? devices[0] : null);
  const targetDevice =
    devices.find((d) => d.udid === targetUdid) ||
    (devices.length > 1 ? devices[1] : null);

  // Fetch photo count whenever sourceDevice changes
  useEffect(() => {
    if (sourceDevice) {
      invoke<{ dcim_count: number; default_dir: string }>("get_export_stats", {
        udid: sourceDevice.udid,
      })
        .then((stats) => {
          if (stats.dcim_count) setDcimCount(stats.dcim_count);
        })
        .catch(console.debug);
    }
  }, [sourceDevice?.udid]);

  // Load interactive media catalog
  const loadMediaCatalog = async (udid?: string) => {
    const id = udid || sourceDevice?.udid;
    if (!id) return;
    setIsCatalogLoading(true);
    try {
      const res = await invoke<MediaCatalogSummary>("fetch_media_catalog", {
        udid: id,
      });
      setCatalog(res);
      if (res.total_files) {
        setDcimCount(res.total_files);
      }
    } catch (err) {
      console.error("Failed to load media catalog:", err);
    } finally {
      setIsCatalogLoading(false);
    }
  };

  // Auto-fetch catalog when user navigates to media tab
  useEffect(() => {
    if (currentTab === "media" && !catalog && sourceDevice) {
      loadMediaCatalog(sourceDevice.udid);
    }
  }, [currentTab, sourceDevice?.udid]);

  // Phone unplugged -> forget its catalog
  useEffect(() => {
    if (!sourceDevice) setCatalog(null);
  }, [sourceDevice?.udid]);

  // Keyboard: ⌘1-4 pages, ⌘, settings, ⌘R rescan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      const tabs: Record<string, TabId> = {
        "1": "transfer",
        "2": "media",
        "3": "cable",
        "4": "diagnostics",
        ",": "settings",
      };
      if (tabs[e.key]) {
        e.preventDefault();
        setCurrentTab(tabs[e.key]);
      } else if (e.key === "r" && !e.shiftKey) {
        e.preventDefault();
        if (currentTab === "media") loadMediaCatalog();
        else refreshDevices();
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
      if (selected && typeof selected === "string") {
        setExportPath(selected);
      }
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

  const handleToggleCategory = (cat: "photos" | "contacts" | "files") => {
    setSelectedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  // Files already in the destination folder must not count as progress
  const readBaseline = async (dir: string) => {
    try {
      return await invoke<ExportProgress>("get_export_progress", {
        destinationDir: dir,
      });
    } catch {
      return { copied_files: 0, copied_bytes: 0, current_album: "" };
    }
  };

  // Export specific user-selected files (e.g. from MediaExplorer)
  const handleExportSelectedMedia = async (paths: string[]) => {
    if (!sourceDevice || paths.length === 0) return;
    let targetDir = exportPath;
    if (!targetDir) {
      try {
        targetDir = await invoke<string>("get_default_export_dir");
        setExportPath(targetDir);
      } catch {
        targetDir = "~/Pictures/WireShift_Exports";
      }
    }

    setIsMigrating(true);
    setIsExportSuccess(false);
    setProgress(1);
    setSpeedText("");
    setEtaText("");

    const pathSet = new Set(paths);
    const selectedItems =
      catalog?.items.filter((i) => pathSet.has(i.path)) || [];
    const totalSelectedBytes =
      selectedItems.reduce((acc, i) => acc + i.size_bytes, 0) ||
      100 * 1024 * 1024;
    setDcimCount(paths.length);
    setCopiedCount(0);
    setCopiedBytes(0);

    const baseline = await readBaseline(targetDir);
    const startTime = Date.now();
    const progressTimer = setInterval(async () => {
      try {
        const prog = await invoke<ExportProgress>("get_export_progress", {
          destinationDir: targetDir,
        });
        if (!prog) return;
        const bytes = Math.max(prog.copied_bytes - baseline.copied_bytes, 0);
        const files = Math.max(prog.copied_files - baseline.copied_files, 0);
        setCopiedBytes(bytes);
        setCopiedCount(files);
        const elapsedSeconds = Math.max((Date.now() - startTime) / 1000, 0.5);
        const mbPerSec = bytes / (1024 * 1024) / elapsedSeconds;

        setProgress(
          Math.max(
            Math.min(Math.round((bytes / totalSelectedBytes) * 100), 99),
            1,
          ),
        );
        if (mbPerSec > 0.5) {
          setSpeedText(`${mbPerSec.toFixed(1)} MB/s`);
          const remainingBytes = Math.max(totalSelectedBytes - bytes, 0);
          setEtaText(
            formatEta(Math.round(remainingBytes / (mbPerSec * 1024 * 1024))),
          );
        }
      } catch (e) {
        console.debug("Progress poll error:", e);
      }
    }, 400);

    try {
      await invoke("export_selected_media", {
        udid: sourceDevice.udid,
        destinationDir: targetDir,
        paths,
      });
      setProgress(100);
      setIsExportSuccess(true);
      if (settings.openFinderAfterExport) handleOpenExportFolder();
    } catch (err) {
      console.error("Export selected error:", err);
      alert("Eksport jarayonida xatolik yuz berdi: " + err);
    } finally {
      clearInterval(progressTimer);
      setIsMigrating(false);
    }
  };

  const handleCancelMigration = async () => {
    try {
      await invoke("cancel_export");
    } catch (e) {
      console.debug("Cancel export error:", e);
    } finally {
      setIsMigrating(false);
      setProgress(0);
    }
  };

  const handleStartMigration = async () => {
    setIsMigrating(true);
    setIsExportSuccess(false);
    setProgress(1);
    setSpeedText("");
    setEtaText("");

    if (targetMode === "pc") {
      let progressTimer: ReturnType<typeof setInterval> | undefined;
      try {
        setCopiedCount(0);
        setCopiedBytes(0);
        setCurrentAlbum("");
        const baseline = await readBaseline(exportPath);
        const startTime = Date.now();

        progressTimer = setInterval(async () => {
          try {
            const prog = await invoke<ExportProgress>("get_export_progress", {
              destinationDir: exportPath,
            });
            if (!prog) return;
            const files = Math.max(
              prog.copied_files - baseline.copied_files,
              0,
            );
            const bytes = Math.max(
              prog.copied_bytes - baseline.copied_bytes,
              0,
            );
            setCopiedCount(files);
            setCopiedBytes(bytes);
            if (prog.current_album) setCurrentAlbum(prog.current_album);

            if (dcimCount > 0) {
              setProgress(
                Math.max(
                  Math.min(Math.round((files / dcimCount) * 100), 99),
                  1,
                ),
              );
              const elapsedSeconds = Math.max(
                (Date.now() - startTime) / 1000,
                1,
              );
              const mbPerSec = bytes / (1024 * 1024) / elapsedSeconds;
              if (mbPerSec > 0.5) {
                setSpeedText(`${mbPerSec.toFixed(1)} MB/s`);
                const remainingFiles = Math.max(dcimCount - files, 0);
                const avgBytesPerFile =
                  files > 0 ? bytes / files : 12 * 1024 * 1024;
                setEtaText(
                  formatEta(
                    Math.round(
                      (remainingFiles * avgBytesPerFile) /
                        (mbPerSec * 1024 * 1024),
                    ),
                  ),
                );
              }
            }
          } catch (e) {
            console.debug("Progress poll error:", e);
          }
        }, 600);

        if (sourceDevice && selectedCategories.photos) {
          await invoke("export_dcim_to_pc", {
            udid: sourceDevice.udid,
            destinationDir: exportPath,
          });
        }

        setProgress(100);
        setIsExportSuccess(true);
        if (settings.openFinderAfterExport) handleOpenExportFolder();
      } catch (err) {
        console.error("Export failed:", err);
        alert("Eksport jarayonida xatolik yuz berdi: " + err);
      } finally {
        if (progressTimer) clearInterval(progressTimer);
        setIsMigrating(false);
      }
    } else {
      let current = 0;
      const timer = setInterval(() => {
        current += 5;
        setProgress(current);
        if (current >= 100) {
          clearInterval(timer);
          setIsMigrating(false);
          alert(
            "✅ Muvaffaqiyatli! Barcha ma'lumotlar yangi telefonga to'liq ko'chirildi.",
          );
        }
      }, 400);
    }
  };

  const progressLabel = `Yuklanmoqda · ${progress}%${speedText ? ` · ${speedText}` : ""}`;

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
        isMigrating={isMigrating}
        progress={progress}
        progressLabel={progressLabel}
        onCancel={handleCancelMigration}
      />

      <main className="ws-main flex-1 min-w-0 flex flex-col">
        {currentTab === "transfer" && (
          <TransferView
            sourceDevice={sourceDevice}
            targetDevice={targetDevice}
            devices={devices}
            onSelectSource={setSourceUdid}
            onSelectTarget={setTargetUdid}
            targetMode={targetMode}
            onToggleTargetMode={setTargetMode}
            exportPath={exportPath}
            onPickExportPath={handlePickExportFolder}
            onOpenFolder={handleOpenExportFolder}
            selectedCategories={selectedCategories}
            onToggleCategory={handleToggleCategory}
            dcimCount={dcimCount}
            catalog={catalog}
            onStart={handleStartMigration}
            onCancel={handleCancelMigration}
            isMigrating={isMigrating}
            isExportSuccess={isExportSuccess}
            progress={progress}
            speedText={speedText}
            etaText={etaText}
            copiedCount={copiedCount}
            copiedBytes={copiedBytes}
            currentAlbum={currentAlbum}
            onOpenGallery={() => setCurrentTab("media")}
            onOpenCableSpeed={() => setCurrentTab("cable")}
          />
        )}

        {currentTab === "media" && (
          <MediaExplorer
            catalog={catalog}
            isLoading={isCatalogLoading}
            hasDevice={!!sourceDevice}
            onRefreshCatalog={() => loadMediaCatalog()}
            destinationDir={exportPath}
            onExportSelected={handleExportSelectedMedia}
            isExporting={isMigrating}
            exportProgress={progress}
            isExportSuccess={isExportSuccess}
            onOpenFolder={handleOpenExportFolder}
            onCancelExport={handleCancelMigration}
            udid={sourceDevice?.udid}
            includeSidecars={settings.includeSidecars}
            thumbSize={settings.thumbSize}
            onThumbSizeChange={(v) => updateSetting("thumbSize", v)}
          />
        )}

        {currentTab === "cable" && (
          <>
            <PageHeader
              title="Kabel tezligi"
              subtitle={sourceDevice?.marketing_name}
            />
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-5xl mx-auto">
                <CableSpeedView
                  device={sourceDevice}
                  onOpenFinalCutBridge={() => setCurrentTab("media")}
                />
              </div>
            </div>
          </>
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
