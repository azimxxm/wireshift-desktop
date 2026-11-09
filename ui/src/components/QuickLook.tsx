import React, { useEffect, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  FileText,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { MediaItem } from "../types";
import { formatBytes, mediaUrl } from "../utils/format";
import { titlebarProps } from "../utils/windowDrag";

interface QuickLookProps {
  items: MediaItem[];
  index: number;
  udid: string;
  thumbnails: Record<string, string>;
  isSelected: (path: string) => boolean;
  onToggleSelect: (path: string) => void;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

/** Quick Look style preview. Video and full-size photos stream from the phone (no download). */
export const QuickLook: React.FC<QuickLookProps> = ({
  items,
  index,
  udid,
  thumbnails,
  isSelected,
  onToggleSelect,
  onNavigate,
  onClose,
}) => {
  const item = items[index];
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
  }, [item?.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" && index < items.length - 1) {
        e.preventDefault();
        onNavigate(index + 1);
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        onNavigate(index - 1);
      } else if (e.key === "Enter" && item) {
        e.preventDefault();
        onToggleSelect(item.path);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, items.length, item, onClose, onNavigate, onToggleSelect]);

  if (!item) return null;

  const thumb = thumbnails[`${item.album}_${item.name}`];
  const src = mediaUrl(udid, item.path);
  const selected = isSelected(item.path);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-xl ws-sheet-in"
      onClick={onClose}
    >
      {/* top bar */}
      {/* left padding keeps clear of the traffic lights; bar still drags the window */}
      <div
        {...titlebarProps}
        className="h-[52px] shrink-0 flex items-center justify-between gap-4 pl-[88px] pr-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex items-baseline gap-2.5">
          <span className="text-[13px] font-semibold text-white truncate">
            {item.name}
          </span>
          <span className="text-[12px] text-white/50 truncate tabular-nums">
            {formatBytes(item.size_bytes)} · {item.date} · {item.album}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-white/40 tabular-nums mr-2">
            {index + 1} / {items.length}
          </span>
          <button
            className={`ws-btn ${selected ? "ws-btn-primary" : ""}`}
            onClick={() => onToggleSelect(item.path)}
            title="Tanlash (Enter)"
          >
            {selected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            {selected ? "Tanlangan" : "Tanlash"}
          </button>
          <button
            className="ws-icon-btn"
            onClick={onClose}
            title="Yopish (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* media */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-16 pb-8">
        <div
          className="relative max-w-full max-h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {item.kind === "video" && !failed && (
            <video
              key={item.path}
              src={src}
              poster={thumb}
              controls
              autoPlay
              playsInline
              onLoadedData={() => setLoading(false)}
              onPlaying={() => setLoading(false)}
              onWaiting={() => setLoading(true)}
              onError={() => {
                setFailed(true);
                setLoading(false);
              }}
              className="max-w-full max-h-[calc(100vh-88px)] rounded-md bg-black"
            />
          )}

          {item.kind === "photo" && !failed && (
            <>
              {thumb && loading && (
                <img
                  src={thumb}
                  alt=""
                  className="max-w-full max-h-[calc(100vh-88px)] rounded-md blur-[2px]"
                />
              )}
              <img
                key={item.path}
                src={src}
                alt={item.name}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setFailed(true);
                  setLoading(false);
                }}
                className={`max-w-full max-h-[calc(100vh-88px)] rounded-md ${loading ? "absolute opacity-0" : ""}`}
              />
            </>
          )}

          {(failed || (item.kind !== "video" && item.kind !== "photo")) && (
            <div className="flex flex-col items-center text-center text-white/60 gap-2 px-10 py-12">
              {thumb ? (
                <img
                  src={thumb}
                  alt=""
                  className="max-h-[50vh] rounded-md mb-2"
                />
              ) : failed ? (
                <AlertTriangle className="w-8 h-8 text-[var(--ws-orange)]" />
              ) : (
                <FileText className="w-10 h-10" strokeWidth={1.3} />
              )}
              <p className="text-[13px] text-white">
                {failed
                  ? "Faylni telefondan o'qib bo'lmadi"
                  : item.kind === "sidecar"
                    ? "Rasm tahriri fayli (AAE)"
                    : item.extension}
              </p>
              <p className="text-[12px] max-w-sm">
                {failed
                  ? "Telefon ulanganini va ekrani ochiqligini tekshiring."
                  : item.kind === "sidecar"
                    ? "iPhone Photos'dagi kesish, filtr va boshqa tahrirlar shu faylda saqlanadi. Rasm bilan birga saqlansa, tahrirlar yo'qolmaydi."
                    : "Bu fayl turini oldindan ko'rib bo'lmaydi."}
              </p>
            </div>
          )}

          {loading &&
            !failed &&
            (item.kind === "video" || item.kind === "photo") && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-7 h-7 text-white/70 animate-spin" />
              </div>
            )}
        </div>

        {index > 0 && (
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(index - 1);
            }}
            title="Oldingi (←)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(index + 1);
            }}
            title="Keyingi (→)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
