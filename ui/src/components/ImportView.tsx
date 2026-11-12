import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Smartphone,
  FilePlus2,
  FolderPlus,
  Folder,
  FileVideo,
  FileImage,
  File as FileIcon,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Upload,
  HelpCircle,
} from "lucide-react";
import {
  ConnectedDevice,
  SharedApp,
  LocalItem,
  ImportProgress,
  ImportResult,
} from "../types";
import { PageHeader } from "./PageHeader";
import { ImportHelp } from "./ImportHelp";
import { formatBytes } from "../utils/format";

export interface ImportBusyState {
  active: boolean;
  progress: number;
  label: string;
}

interface ImportViewProps {
  device: ConnectedDevice | null;
  devices: ConnectedDevice[];
  onSelectDevice: (udid: string) => void;
  /** page is on screen: only then Finder drops land here */
  isVisible: boolean;
  preferredApp: string;
  onPreferredAppChange: (bundleId: string) => void;
  onBusyChange: (state: ImportBusyState) => void;
}

const VIDEO_EXT = ["mov", "mp4", "m4v", "hevc", "avi", "mkv"];
const PHOTO_EXT = [
  "jpg",
  "jpeg",
  "heic",
  "heif",
  "png",
  "gif",
  "tif",
  "tiff",
  "dng",
  "webp",
  "raw",
];

/** Good default targets when the user hasn't picked one yet (media players / file managers) */
const MEDIA_APPS = [
  "org.videolan.vlc-ios",
  "com.readdle.ReaddleDocsIPad",
  "com.luma-touch.LumaFusion",
  "com.blackmagic-design.DaVinciCamera",
  "com.dji.mimo",
];

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

const defaultFolderName = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `WireShift ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
};

const ItemIcon: React.FC<{ item: LocalItem }> = ({ item }) => {
  const cls = "w-4 h-4 shrink-0";
  if (item.is_dir)
    return <Folder className={`${cls} text-[var(--ws-accent)]`} />;
  const ext = extOf(item.name);
  if (VIDEO_EXT.includes(ext))
    return <FileVideo className={`${cls} text-[var(--ws-label-2)]`} />;
  if (PHOTO_EXT.includes(ext))
    return <FileImage className={`${cls} text-[var(--ws-label-2)]`} />;
  return <FileIcon className={`${cls} text-[var(--ws-label-2)]`} />;
};

export const ImportView: React.FC<ImportViewProps> = ({
  device,
  devices,
  onSelectDevice,
  isVisible,
  preferredApp,
  onPreferredAppChange,
  onBusyChange,
}) => {
  const [apps, setApps] = useState<SharedApp[] | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState("");
  const [items, setItems] = useState<LocalItem[]>([]);
  const [folderName, setFolderName] = useState(defaultFolderName);
  const [isDragOver, setIsDragOver] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [prog, setProg] = useState<ImportProgress | null>(null);
  const [speedText, setSpeedText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const udid = device?.is_trusted ? device.udid : "";
  const selectedApp =
    apps?.find((a) => a.bundle_id === preferredApp) ??
    MEDIA_APPS.map((id) => apps?.find((a) => a.bundle_id === id)).find(Boolean) ??
    apps?.find((a) => a.visible_in_files) ??
    apps?.[0] ??
    null;

  const loadApps = useCallback(async () => {
    if (!udid) return;
    setAppsLoading(true);
    setAppsError("");
    try {
      setApps(await invoke<SharedApp[]>("list_shared_apps", { udid }));
    } catch (e) {
      setApps(null);
      setAppsError(String(e));
    } finally {
      setAppsLoading(false);
    }
  }, [udid]);

  useEffect(() => {
    setApps(null);
    if (udid) loadApps();
  }, [udid, loadApps]);

  const addPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const found = await invoke<LocalItem[]>("inspect_local_paths", { paths });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.path));
        return [
          ...prev,
          ...found.filter((i) => i.file_count > 0 && !seen.has(i.path)),
        ];
      });
      setResult(null);
      setError("");
    } catch (e) {
      console.error("inspect_local_paths failed:", e);
    }
  }, []);

  // Finder drag & drop straight onto the window
  const visibleRef = useRef(isVisible);
  visibleRef.current = isVisible;
  const busyRef = useRef(isImporting);
  busyRef.current = isImporting;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!visibleRef.current || busyRef.current) return;
        const t = event.payload.type;
        if (t === "enter" || t === "over") setIsDragOver(true);
        else if (t === "leave") setIsDragOver(false);
        else if (t === "drop") {
          setIsDragOver(false);
          addPaths(event.payload.paths);
        }
      })
      .then((fn) => (unlisten = fn))
      .catch((e) => console.error("drag-drop listener failed:", e));
    return () => unlisten?.();
  }, [addPaths]);

  const pickFiles = async () => {
    try {
      const picked = await openDialog({
        multiple: true,
        title: "iPhone'ga yuboriladigan fayllar",
        filters: [
          {
            name: "Video va rasmlar",
            extensions: [...VIDEO_EXT, ...PHOTO_EXT],
          },
          { name: "Hamma fayllar", extensions: ["*"] },
        ],
      });
      if (picked) addPaths(Array.isArray(picked) ? picked : [picked]);
    } catch (e) {
      console.error("File picker error:", e);
    }
  };

  const pickFolder = async () => {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: true,
        title: "Papkani tanlang",
      });
      if (picked) addPaths(Array.isArray(picked) ? picked : [picked]);
    } catch (e) {
      console.error("Folder picker error:", e);
    }
  };

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, i) => ({ n: acc.n + i.file_count, b: acc.b + i.size_bytes }),
        { n: 0, b: 0 },
      ),
    [items],
  );

  const percent =
    prog && prog.total_bytes > 0
      ? Math.min(Math.round((prog.done_bytes / prog.total_bytes) * 100), 100)
      : 0;

  useEffect(() => {
    onBusyChange({
      active: isImporting,
      progress: percent,
      label: `iPhone'ga · ${percent}%${speedText ? ` · ${speedText}` : ""}`,
    });
  }, [isImporting, percent, speedText, onBusyChange]);

  const start = async () => {
    if (!udid || !selectedApp || items.length === 0 || isImporting) return;
    cancelledRef.current = false;
    setIsImporting(true);
    setResult(null);
    setError("");
    setProg(null);
    setSpeedText("");

    const startedAt = Date.now();
    const timer = setInterval(async () => {
      try {
        const p = await invoke<ImportProgress>("get_import_progress");
        setProg(p);
        const mbPerSec =
          p.done_bytes /
          (1024 * 1024) /
          Math.max((Date.now() - startedAt) / 1000, 0.5);
        if (mbPerSec > 0.5) setSpeedText(`${mbPerSec.toFixed(1)} MB/s`);
      } catch (e) {
        console.debug("Import progress poll error:", e);
      }
    }, 400);

    try {
      const res = await invoke<ImportResult>("import_to_iphone", {
        udid,
        bundleId: selectedApp.bundle_id,
        folder: folderName,
        paths: items.map((i) => i.path),
      });
      setResult(res);
      setItems([]);
      setFolderName(defaultFolderName());
    } catch (e) {
      if (!cancelledRef.current && String(e) !== "cancelled") {
        setError(String(e));
        // the phone refused the app folder: show how to fix it right away
        if (!String(e).includes("joy yetmaydi")) setHelpOpen(true);
      }
    } finally {
      clearInterval(timer);
      setIsImporting(false);
    }
  };

  const cancel = async () => {
    cancelledRef.current = true;
    try {
      await invoke("cancel_import");
    } catch (e) {
      console.debug("Cancel import error:", e);
    }
  };

  const canStart =
    !!udid &&
    !!selectedApp &&
    items.length > 0 &&
    !isImporting &&
    folderName.trim().length > 0;

  return (
    <>
      <PageHeader title="iPhone'ga yuborish" subtitle="Mac → iPhone">
        <button
          className="ws-btn inline-flex items-center gap-1.5"
          onClick={() => setHelpOpen(true)}
        >
          <HelpCircle className="w-3.5 h-3.5" /> Qanday ishlaydi?
        </button>
      </PageHeader>

      <ImportHelp
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        errorText={error || undefined}
        appName={selectedApp?.name}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-6 space-y-6">
          <section>
            <div className="ws-section-title">Qabul qiluvchi</div>
            <div className="ws-group">
              <div className="ws-row">
                <div className="flex items-center gap-3 min-w-0">
                  <Smartphone className="w-4 h-4 text-[var(--ws-accent)] shrink-0" />
                  {devices.length > 1 && device ? (
                    <select
                      value={device.udid}
                      disabled={isImporting}
                      onChange={(e) => onSelectDevice(e.target.value)}
                      className="ws-field text-[13px]"
                    >
                      {devices.map((d) => (
                        <option key={d.udid} value={d.udid}>
                          {d.name || d.marketing_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[13px] truncate">
                      {device
                        ? device.name || device.marketing_name
                        : "iPhone ulanmagan"}
                    </span>
                  )}
                </div>
                {device?.storage && (
                  <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums shrink-0">
                    {formatBytes(device.storage.available_bytes)} bo'sh
                  </span>
                )}
              </div>

              <div className="ws-row">
                <div className="min-w-0">
                  <div className="text-[13px]">Telefondagi ilova</div>
                  <div className="text-[11px] text-[var(--ws-label-2)] mt-0.5">
                    Fayllar shu ilovaning papkasiga tushadi (Files → On My
                    iPhone)
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {appsLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--ws-label-2)]" />
                  ) : apps && apps.length > 0 ? (
                    <select
                      value={selectedApp?.bundle_id ?? ""}
                      disabled={isImporting}
                      onChange={(e) => onPreferredAppChange(e.target.value)}
                      className="ws-field text-[13px] max-w-[220px]"
                    >
                      {apps.map((a) => (
                        <option key={a.bundle_id} value={a.bundle_id}>
                          {a.name}
                          {a.visible_in_files ? "" : " (Files'da ko'rinmaydi)"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[12px] text-[var(--ws-label-3)]">
                      —
                    </span>
                  )}
                  <button
                    className="ws-icon-btn"
                    title="Ilovalarni qayta o'qish"
                    disabled={!udid || appsLoading || isImporting}
                    onClick={loadApps}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {!device && (
              <p className="mt-2 text-[12px] text-[var(--ws-label-2)]">
                Telefonni USB kabel bilan ulang va ekranida «Ishonish»ni bosing.
              </p>
            )}
            {device && !device.is_trusted && (
              <p className="mt-2 text-[12px] text-[var(--ws-orange)]">
                Telefonda «Ishonish»ni bosing.
              </p>
            )}
            {appsError && (
              <p className="mt-2 text-[12px] text-[var(--ws-red)]">
                {appsError}
              </p>
            )}
            {apps && apps.length === 0 && (
              <p className="mt-2 text-[12px] text-[var(--ws-orange)]">
                Telefonda fayl qabul qiladigan ilova topilmadi. VLC, LumaFusion
                yoki «Documents» kabi Files'da papkasi bor ilova kerak.
              </p>
            )}
            {selectedApp && !selectedApp.visible_in_files && (
              <p className="mt-2 text-[12px] text-[var(--ws-orange)]">
                {selectedApp.name} papkasi Files ilovasida ko'rinmaydi —
                fayllarni faqat shu ilova ichida ochasiz. «Save to Photos» uchun
                Files'da ko'rinadigan ilovani tanlang.
              </p>
            )}
          </section>

          <section>
            <div className="ws-section-title">Fayllar</div>
            <div
              className={`ws-group transition-colors ${
                isDragOver
                  ? "outline outline-2 outline-[var(--ws-accent)] bg-[var(--ws-accent)]/10"
                  : ""
              }`}
            >
              {items.length === 0 ? (
                <div className="px-4 py-8 flex flex-col items-center text-center">
                  <Upload
                    className="w-7 h-7 text-[var(--ws-label-3)] mb-2"
                    strokeWidth={1.4}
                  />
                  <p className="text-[13px] font-medium text-white">
                    Video va rasmlarni shu yerga torting
                  </p>
                  <p className="text-[12px] text-[var(--ws-label-2)] mt-0.5">
                    yoki pastdagi tugmalar bilan tanlang — papka ichidagilar ham
                    qo'shiladi
                  </p>
                </div>
              ) : (
                <div className="max-h-[260px] overflow-y-auto">
                  {items.map((i) => (
                    <div key={i.path} className="ws-row">
                      <div className="flex items-center gap-3 min-w-0">
                        <ItemIcon item={i} />
                        <span className="text-[13px] truncate" title={i.path}>
                          {i.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                          {i.is_dir ? `${i.file_count} ta · ` : ""}
                          {formatBytes(i.size_bytes)}
                        </span>
                        <button
                          className="ws-icon-btn !w-5 !h-5"
                          title="Olib tashlash"
                          disabled={isImporting}
                          onClick={() =>
                            setItems((prev) =>
                              prev.filter((x) => x.path !== i.path),
                            )
                          }
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="ws-row">
                <div className="flex items-center gap-1.5">
                  <button
                    className="ws-btn inline-flex items-center gap-1.5"
                    onClick={pickFiles}
                    disabled={isImporting}
                  >
                    <FilePlus2 className="w-3.5 h-3.5" /> Fayl qo'shish…
                  </button>
                  <button
                    className="ws-btn inline-flex items-center gap-1.5"
                    onClick={pickFolder}
                    disabled={isImporting}
                  >
                    <FolderPlus className="w-3.5 h-3.5" /> Papka qo'shish…
                  </button>
                </div>
                {items.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                      {totals.n} ta · {formatBytes(totals.b)}
                    </span>
                    <button
                      className="ws-link text-[12px]"
                      disabled={isImporting}
                      onClick={() => setItems([])}
                    >
                      Tozalash
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section>
            <div className="ws-section-title">Telefondagi papka nomi</div>
            <div className="ws-group">
              <div className="ws-row">
                <input
                  value={folderName}
                  disabled={isImporting}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="ws-field text-[13px] w-full"
                  aria-label="Telefondagi papka nomi"
                />
              </div>
            </div>
          </section>

          {isImporting ? (
            <section className="ws-group p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-white font-medium truncate">
                  {prog?.current_file
                    ? `Yuborilmoqda: ${prog.current_file}`
                    : "Tayyorlanmoqda…"}
                </span>
                <span className="tabular-nums text-white font-medium">
                  {percent}%
                </span>
              </div>
              <div className="ws-progress">
                <div style={{ width: `${Math.max(percent, 1)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--ws-label-2)] tabular-nums">
                <span>
                  {prog &&
                    `${prog.done_files} / ${prog.total_files} ta · ${formatBytes(prog.done_bytes)}`}
                  {speedText && ` · ${speedText}`}
                </span>
                <button className="ws-btn" onClick={cancel}>
                  To'xtatish
                </button>
              </div>
            </section>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="text-[12px] text-[var(--ws-label-2)] min-w-0">
                {error ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--ws-red)]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                    <button className="ws-link ml-1" onClick={() => setHelpOpen(true)}>
                      Nima qilish kerak?
                    </button>
                  </span>
                ) : result ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--ws-green)]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {result.copied} ta fayl telefonga yuborildi.
                  </span>
                ) : (
                  "Telefonda hech narsa o'chirilmaydi — fayllar yangi papkaga qo'shiladi."
                )}
              </div>
              <button
                className="ws-btn ws-btn-primary ws-btn-large shrink-0"
                disabled={!canStart}
                onClick={start}
              >
                iPhone'ga yuborish
              </button>
            </div>
          )}

          {result && selectedApp && (
            <section className="ws-group p-4">
              <div className="text-[13px] font-medium text-white mb-2">
                Rasmlar ilovasiga saqlash (telefonda)
              </div>
              <ol className="list-decimal pl-5 space-y-1 text-[12px] text-[var(--ws-label)]">
                <li>
                  <b>Files</b> ilovasini oching → <b>On My iPhone</b> →{" "}
                  <b>{selectedApp.name}</b> →{" "}
                  <b className="selectable">{result.folder}</b>
                </li>
                <li>
                  Yuqoridagi <b>⋯</b> → <b>Select</b> → pastda <b>Select All</b>
                </li>
                <li>
                  <b>Share</b> tugmasi → <b>Save {result.copied} Items</b> (yoki
                  «Save Images / Videos»)
                </li>
              </ol>
              <p className="mt-2 text-[11px] text-[var(--ws-label-2)]">
                Saqlangandan keyin papkani Files'dan o'chirsangiz bo'ladi — joy
                ikki marta band bo'lmaydi.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
};
