import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Archive,
  CheckCircle2,
  File as FileIcon,
  FileImage,
  FilePlus2,
  FileVideo,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  Send,
  X,
} from "lucide-react";
import { WifiIncoming, WifiOutgoing, WifiZip } from "../../types";
import { formatBytes } from "../../utils/format";

const VIDEO_EXT = ["mov", "mp4", "m4v", "hevc", "avi", "mkv"];
const PHOTO_EXT = ["jpg", "jpeg", "heic", "heif", "png", "gif", "webp", "tif", "tiff", "dng"];
const kindOf = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXT.includes(ext) ? "video" : PHOTO_EXT.includes(ext) ? "image" : "file";
};

/** previews survive page switches; "" = Quick Look had nothing */
const thumbCache = new Map<string, string>();

const Thumb: React.FC<{ previewKey: string | null; name: string }> = ({ previewKey, name }) => {
  const kind = kindOf(name);
  const [src, setSrc] = useState(() => (previewKey ? thumbCache.get(previewKey) : undefined));
  useEffect(() => {
    if (!previewKey || kind === "file" || thumbCache.has(previewKey)) return;
    let alive = true;
    invoke<string>("wifi_thumbnail", { key: previewKey })
      .then((url) => {
        thumbCache.set(previewKey, url);
        if (alive) setSrc(url);
      })
      .catch(() => thumbCache.set(previewKey, ""));
    return () => {
      alive = false;
    };
  }, [previewKey, kind]);
  if (src) return <img src={src} alt="" className="ws-wifi-thumb" draggable={false} />;
  const Icon = kind === "video" ? FileVideo : kind === "image" ? FileImage : FileIcon;
  return (
    <span className="ws-wifi-thumb">
      <Icon className="w-4 h-4 text-[var(--ws-label-2)]" />
    </span>
  );
};

const Progress: React.FC<{ percent: number; done: boolean }> = ({ percent, done }) => (
  <div className={`ws-progress ws-wifi-bar ${done ? "is-done" : ""}`}>
    <div style={{ width: `${done ? 100 : Math.max(percent, 1)}%` }} />
  </div>
);

const CancelledLabel: React.FC<{ by: "phone" | "mac" }> = ({ by }) => (
  <span className="text-[var(--ws-label-3)]">{by === "mac" ? "Bekor qilindi" : "Telefonda bekor"}</span>
);

const openReceived = (id: string, reveal: boolean) =>
  invoke("wifi_open_received", { id, reveal }).catch((e) => alert(String(e)));

const IncomingRow: React.FC<{ item: WifiIncoming; onCancel: () => void }> = ({ item, onCancel }) => {
  const done = !!item.saved_as;
  const cancelled = item.cancelled_by;
  const percent = item.size ? Math.floor((item.received / item.size) * 100) : 100;
  return (
    <div
      className={`ws-row ws-wifi-fade group ${cancelled ? "opacity-60" : ""} ${done ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
      onDoubleClick={done ? () => openReceived(item.id, false) : undefined}
      title={done ? "Ikki marta bosing — ochiladi" : undefined}
    >
      <Thumb previewKey={done ? `in-${item.id}` : null} name={item.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] truncate">{item.saved_as ?? item.name}</span>
          <span className="text-[12px] tabular-nums text-[var(--ws-label-2)] shrink-0">
            {done ? formatBytes(item.size) : `${formatBytes(item.received)} / ${formatBytes(item.size)}`}
          </span>
        </div>
        {!cancelled && <Progress percent={percent} done={done} />}
      </div>
      <span className="w-[120px] shrink-0 flex justify-end text-right text-[12px] tabular-nums">
        {done ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[var(--ws-green)] group-hover:hidden">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saqlandi
            </span>
            <button
              className="ws-btn !h-6 !px-2 !text-[11px] hidden group-hover:inline-flex"
              onClick={() => openReceived(item.id, false)}
            >
              Ochish
            </button>
            <button
              className="ws-icon-btn !w-6 !h-6 hidden group-hover:inline-flex"
              title="Finder'da ko'rsatish"
              onClick={() => openReceived(item.id, true)}
            >
              <FolderSearch className="w-3.5 h-3.5" />
            </button>
          </span>
        ) : cancelled ? (
          <CancelledLabel by={cancelled} />
        ) : (
          <span className="inline-flex items-center gap-2 text-white">
            {percent}%
            <button className="ws-icon-btn !w-5 !h-5" title="Bu faylni bekor qilish" onClick={onCancel}>
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
      </span>
    </div>
  );
};

/** Files arriving from the phone, newest last, with per-file progress. */
export const IncomingList: React.FC<{
  items: WifiIncoming[];
  running: boolean;
  onCancel: (id: string) => void;
  onOpenFolder: () => void;
  onClear: () => void;
}> = ({ items, running, onCancel, onOpenFolder, onClear }) => {
  if (!running && items.length === 0) return null;
  const saved = items.filter((i) => i.saved_as).length;
  return (
    <section>
      <div className="ws-section-title flex justify-between">
        <span>Telefondan kelgan fayllar</span>
        {items.length > 0 && (
          <span className="flex items-center gap-3">
            <span className="tabular-nums">
              {saved} / {items.length} ta saqlandi
            </span>
            <button className="ws-btn !h-6 !px-2 !text-[11px] inline-flex items-center gap-1" onClick={onOpenFolder}>
              <FolderOpen className="w-3.5 h-3.5" /> Papkani ochish
            </button>
            {items.some((i) => i.saved_as || i.cancelled_by) && (
              <button
                className="ws-link text-[11px]"
                title="Ro'yxatni tozalaydi — saqlangan fayllar Mac'da qoladi"
                onClick={onClear}
              >
                Tozalash
              </button>
            )}
          </span>
        )}
      </div>
      <div className="ws-group">
        {items.length === 0 ? (
          <p className="px-4 py-5 text-center text-[12px] text-[var(--ws-label-2)]">
            Hali fayl kelmadi — telefonda «Mac'ga yuborish»ni bosing.
          </p>
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            {items.map((i) => (
              <IncomingRow key={i.id} item={i} onCancel={() => onCancel(i.id)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const OutgoingRow: React.FC<{ item: WifiOutgoing; onRemove: () => void }> = ({ item, onRemove }) => {
  const sent = item.sent_bytes;
  // a download that stopped before the end (browser X, lost Wi-Fi) must not look stuck
  const status =
    item.active > 0
      ? `${Math.min(99, Math.floor(((sent % (item.size || 1)) / (item.size || 1)) * 100))}% yuklanmoqda`
      : sent >= item.size && item.size > 0
        ? "Telefonga yuklandi"
        : sent > 0
          ? "Bekor qilindi"
          : formatBytes(item.size);
  return (
    <div className="ws-row">
      <Thumb previewKey={item.kind === "file" ? null : `out-${item.id}`} name={item.name} />
      <span className="flex-1 min-w-0 text-[13px] truncate" title={item.path}>
        {item.name}
      </span>
      <span
        className={`text-[12px] tabular-nums shrink-0 ${sent >= item.size && item.size > 0 ? "text-[var(--ws-green)]" : "text-[var(--ws-label-2)]"}`}
      >
        {status}
      </span>
      <button className="ws-icon-btn !w-5 !h-5 shrink-0" title="Ro'yxatdan olib tashlash" onClick={onRemove}>
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

const ZIP_TEXT: Record<WifiZip["state"], string> = {
  running: "",
  done: "Telefonga yuborildi",
  cancelled: "Bekor qilindi",
};

const ZipRow: React.FC<{ zip: WifiZip }> = ({ zip }) => {
  const percent = zip.total ? Math.min(99, Math.floor((zip.sent / zip.total) * 100)) : 0;
  return (
    <div className={`ws-row ${zip.state === "cancelled" ? "opacity-60" : ""}`}>
      <span className="ws-wifi-thumb">
        <Archive className="w-4 h-4 text-[var(--ws-accent)]" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] truncate">{zip.name}</div>
        <div className="text-[11px] text-[var(--ws-label-2)] tabular-nums">
          {zip.files} ta fayl · {formatBytes(zip.total)}
        </div>
      </div>
      <span
        className={`text-[12px] tabular-nums shrink-0 ${zip.state === "done" ? "text-[var(--ws-green)]" : zip.state === "cancelled" ? "text-[var(--ws-label-3)]" : "text-white"}`}
      >
        {zip.state === "running" ? `${percent}% yuklanmoqda` : ZIP_TEXT[zip.state]}
      </span>
    </div>
  );
};

interface OutgoingProps {
  items: WifiOutgoing[];
  zips: WifiZip[];
  isDragOver: boolean;
  onPickFiles: () => void;
  onPickFolder: () => void;
  onRemove: (id: number) => void;
  onClear: () => void;
}

/** "Telefonga yuborish ro'yxati": a drop zone; the phone page lists these files. */
export const OutgoingList: React.FC<OutgoingProps> = ({
  items,
  zips,
  isDragOver,
  onPickFiles,
  onPickFolder,
  onRemove,
  onClear,
}) => {
  const total = items.reduce((a, i) => a + i.size, 0);
  return (
    <section>
      <div className="ws-section-title">Telefonga yuborish ro'yxati</div>
      <div className={`ws-group ws-wifi-drop ${isDragOver ? "is-over" : ""}`}>
        {items.length === 0 ? (
          <div className="px-4 py-8 flex flex-col items-center text-center">
            <Send className="ws-wifi-drop-icon w-7 h-7 text-[var(--ws-label-3)] mb-2" strokeWidth={1.4} />
            <p className="text-[13px] font-medium text-white">
              {isDragOver ? "Qo'yib yuboring" : "Video va rasmlarni shu yerga torting"}
            </p>
            <p className="text-[12px] text-[var(--ws-label-2)] mt-0.5">
              Telefon sahifasidagi «Mac'dan olish» bo'limida darhol paydo bo'ladi
            </p>
          </div>
        ) : (
          <div className="max-h-[280px] overflow-y-auto">
            {zips.map((z, n) => (
              <ZipRow key={`${z.name}-${n}`} zip={z} />
            ))}
            {items.map((i) => (
              <OutgoingRow key={i.id} item={i} onRemove={() => onRemove(i.id)} />
            ))}
          </div>
        )}
        <div className="ws-row">
          <div className="flex items-center gap-1.5">
            <button className="ws-btn inline-flex items-center gap-1.5" onClick={onPickFiles}>
              <FilePlus2 className="w-3.5 h-3.5" /> Fayl qo'shish…
            </button>
            <button className="ws-btn inline-flex items-center gap-1.5" onClick={onPickFolder}>
              <FolderPlus className="w-3.5 h-3.5" /> Papka qo'shish…
            </button>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                {items.length} ta · {formatBytes(total)}
              </span>
              <button className="ws-link text-[12px]" onClick={onClear}>
                Tozalash
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
