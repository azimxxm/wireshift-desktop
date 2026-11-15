import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Folder, Loader2 } from "lucide-react";
import { MacRequest } from "../../types";
import { formatBytes } from "../../utils/format";
import { MacIcon } from "./MacIcon";
import "./maclink.css";

interface Props {
  request: MacRequest | null;
  receiveDir: string;
  onAnswered: (accepted: boolean) => void;
}

const shortDir = (dir: string) => dir.replace(/^\/Users\/[^/]+/, "~");

/** Shown on any page when another Mac wants to send: one clear yes / no. */
export const IncomingRequestSheet: React.FC<Props> = ({
  request,
  receiveDir,
  onAnswered,
}) => {
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTrust(false);
    setBusy(false);
  }, [request?.id]);

  const answer = async (accept: boolean) => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await invoke("maclink_respond", {
        id: request.id,
        accept,
        trust: accept && trust,
      });
    } catch (e) {
      console.error("maclink_respond failed:", e);
    }
    onAnswered(accept);
  };

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        answer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!request) return null;
  const more = request.files > request.roots.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ws-mac-req-title"
        className="ws-sheet-in ws-mac-sheet w-[400px] rounded-2xl bg-[var(--ws-elevated)] border border-white/10 shadow-2xl px-7 pt-7 pb-5"
      >
        <div className="flex flex-col items-center text-center">
          <div className="ws-mac-sheet-icon">
            <MacIcon model={request.from_model} size={60} />
          </div>
          <h2
            id="ws-mac-req-title"
            className="mt-3 text-[16px] font-semibold text-white leading-snug"
          >
            {request.from_name} sizga fayl yubormoqchi
          </h2>
          <p className="mt-1 text-[13px] text-[var(--ws-label-2)] tabular-nums">
            {formatBytes(request.total)} · {request.files.toLocaleString("ru-RU")}{" "}
            ta fayl
          </p>
        </div>

        <ul className="mt-4 ws-group divide-y divide-[var(--ws-separator)] max-h-[132px] overflow-y-auto">
          {request.roots.map((r) => (
            <li
              key={r}
              className="flex items-center gap-2 px-3 h-8 text-[12px] text-[var(--ws-label)]"
            >
              <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--ws-label-3)]" />
              <span className="truncate">{r}</span>
            </li>
          ))}
          {more && request.roots.length >= 5 && (
            <li className="px-3 h-7 flex items-center text-[11px] text-[var(--ws-label-3)]">
              va boshqalar…
            </li>
          )}
        </ul>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-black/25 border border-[var(--ws-separator)] px-4 py-3">
          <div className="text-[12px] leading-snug text-[var(--ws-label-2)]">
            Tasdiqlash kodi
            <div className="text-[11px] text-[var(--ws-label-3)]">
              {request.from_name}'da ham shu kod chiqqan
            </div>
          </div>
          <div
            className="ws-mac-code"
            aria-label={`Kod ${request.code.split("").join(" ")}`}
          >
            {request.code}
          </div>
        </div>

        {request.resume_bytes > 0 && (
          <p className="mt-3 text-[12px] text-[var(--ws-green)]">
            Avvalgi urinishdan {formatBytes(request.resume_bytes)} allaqachon
            bor — qolgani yuboriladi.
          </p>
        )}

        <button
          type="button"
          onClick={() => setTrust((v) => !v)}
          className="mt-4 flex items-center gap-2 text-left text-[12px] text-[var(--ws-label)]"
          aria-pressed={trust}
        >
          <span className="ws-checkbox" data-checked={trust}>
            {trust && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
          </span>
          {request.from_name}'ga ishonaman — keyingi safar so'ramasin
        </button>

        <p
          className="mt-3 text-[11px] text-[var(--ws-label-3)] truncate"
          title={receiveDir}
        >
          Saqlanadi: {shortDir(receiveDir)}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            className="ws-btn justify-center h-8"
            onClick={() => answer(false)}
            disabled={busy}
          >
            Rad etish
          </button>
          <button
            className="ws-btn ws-btn-primary justify-center h-8 inline-flex gap-1.5"
            onClick={() => answer(true)}
            disabled={busy}
            autoFocus
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Qabul qilish
          </button>
        </div>
      </div>
    </div>
  );
};
