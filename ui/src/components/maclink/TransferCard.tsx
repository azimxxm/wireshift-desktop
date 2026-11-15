import React from "react";
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  FolderOpen,
  Pause,
  Play,
  RotateCw,
  Wifi,
  X,
} from "lucide-react";
import { MacReceive, MacSend } from "../../types";
import { formatBytes } from "../../utils/format";
import { MacIcon } from "./MacIcon";
import { formatDuration, formatEta, formatSpeed } from "./useMacLink";

type Tone = "live" | "paused" | "warn" | "done" | "bad";

interface CardModel {
  fromName: string;
  fromModel: string;
  toName: string;
  toModel: string;
  tone: Tone;
  headline: string;
  note?: string | null;
  total: number;
  done: number;
  speed: number;
  files: number;
  current?: string | null;
  link?: "cable" | "wifi" | null;
  elapsedMs: number;
  /** speed / time left only make sense once bytes move */
  showStats?: boolean;
}

const Readout: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="min-w-0">
    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ws-label-3)]">
      {label}
    </div>
    <div className="mt-1 text-[15px] font-semibold tabular-nums text-white truncate">
      {value}
    </div>
  </div>
);

const Route: React.FC<{ m: CardModel }> = ({ m }) => (
  <div className="flex items-center gap-4">
    <div className="ws-mac-node">
      <MacIcon model={m.fromModel} size={44} />
      <span className="truncate">{m.fromName}</span>
    </div>
    <div className={`ws-mac-beam is-${m.tone}`} aria-hidden>
      <span />
    </div>
    <div className="ws-mac-node">
      <MacIcon model={m.toModel} size={44} />
      <span className="truncate">{m.toName}</span>
    </div>
  </div>
);

const Card: React.FC<{
  m: CardModel;
  children: React.ReactNode;
  extra?: React.ReactNode;
}> = ({ m, children, extra }) => {
  const pct =
    m.total > 0
      ? Math.min((m.done / m.total) * 100, 100)
      : m.tone === "done"
        ? 100
        : 0;
  const finished = m.tone === "done" || m.tone === "bad";
  return (
    <section className={`ws-mac-card is-${m.tone}`} aria-live="polite">
      <Route m={m} />
      <div className="mt-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="ws-mac-eyebrow">
            {m.tone === "done" ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : m.tone === "warn" || m.tone === "bad" ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <span
                className={`ws-mac-dot ${m.tone === "live" ? "is-pulse" : ""}`}
              />
            )}
            {m.headline}
          </div>
          {m.note && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ws-label-2)] max-w-[440px]">
              {m.note}
            </p>
          )}
        </div>
        <div className="ws-mac-pct tabular-nums">
          {Math.floor(pct)}
          <span>%</span>
        </div>
      </div>
      <div
        className={`ws-mac-bar is-${m.tone}`}
        role="progressbar"
        aria-valuenow={Math.floor(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${Math.max(pct, m.done > 0 ? 1 : 0)}%` }} />
      </div>
      {extra}
      {m.showStats !== false && (
        <div className="mt-5 grid grid-cols-3 gap-4">
          {finished ? (
            <>
              <Readout label="Hajm" value={formatBytes(m.done)} />
              <Readout label="Vaqt" value={formatDuration(m.elapsedMs)} />
              <Readout
                label="O'rtacha"
                value={formatSpeed(
                  m.elapsedMs > 0 ? m.done / (m.elapsedMs / 1000) : 0,
                )}
              />
            </>
          ) : (
            <>
              <Readout label="Tezlik" value={formatSpeed(m.speed)} />
              <Readout
                label="Qoldi"
                value={formatEta(m.total - m.done, m.speed)}
              />
              <Readout
                label="Hajm"
                value={`${formatBytes(m.done)} / ${formatBytes(m.total)}`}
              />
            </>
          )}
        </div>
      )}
      <div className="mt-5 pt-4 border-t border-[var(--ws-separator)] flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 text-[12px] text-[var(--ws-label-3)]">
          {m.link === "cable" ? (
            <Cable className="w-3.5 h-3.5 shrink-0" />
          ) : m.link === "wifi" ? (
            <Wifi className="w-3.5 h-3.5 shrink-0" />
          ) : null}
          <span className="truncate" title={m.current ?? undefined}>
            {!finished && m.current
              ? m.current
              : `${m.files.toLocaleString("ru-RU")} ta fayl`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      </div>
    </section>
  );
};

// ---------- sending ----------

const SEND_TEXT: Record<MacSend["state"], [Tone, string]> = {
  connecting: ["live", "Ulanmoqda…"],
  waiting: ["live", "Tasdiqlash kutilmoqda"],
  sending: ["live", "Yuborilmoqda"],
  paused: ["paused", "Pauza"],
  reconnecting: ["warn", "Aloqa uzildi — qayta ulanmoqda"],
  done: ["done", "Yuborildi"],
  declined: ["bad", "Qabul qilinmadi"],
  failed: ["bad", "Yuborib bo'lmadi"],
  cancelled: ["bad", "Bekor qilindi"],
};

interface SendProps {
  send: MacSend;
  myName: string;
  myModel: string;
  speed: number;
  onPause: (paused: boolean) => void;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export const SendCard: React.FC<SendProps> = ({
  send,
  myName,
  myModel,
  speed,
  onPause,
  onCancel,
  onRetry,
  onClose,
}) => {
  const [tone, headline] = SEND_TEXT[send.state];
  const note =
    send.state === "reconnecting"
      ? "Fayllar to'xtagan joyidan davom etadi. Ikkala Mac ham yoqiq va bitta tarmoqda bo'lsin."
      : send.state === "waiting"
        ? `${send.peer_name} ekranida «Qabul qilish» tugmasini bosing.`
        : send.message;
  const live = !["done", "declined", "failed", "cancelled"].includes(
    send.state,
  );
  const m: CardModel = {
    fromName: myName,
    fromModel: myModel,
    toName: send.peer_name,
    toModel: send.peer_model,
    tone,
    headline,
    note,
    total: send.total,
    done: send.done,
    speed,
    files: send.files,
    current:
      send.state === "sending" || send.state === "paused" ? send.current : null,
    link: send.link,
    elapsedMs: send.elapsed_ms,
    showStats: send.state !== "waiting" && send.state !== "connecting",
  };
  const codeBlock =
    send.state === "waiting" ? (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-black/25 border border-[var(--ws-separator)] px-4 py-3">
        <span className="text-[12px] text-[var(--ws-label-2)]">
          {send.peer_name}'dagi kod shu bilan bir xil bo'lishi kerak
        </span>
        <span className="ws-mac-code">{send.code}</span>
      </div>
    ) : null;

  return (
    <Card m={m} extra={codeBlock}>
      {live ? (
        <>
          {(send.state === "sending" || send.state === "paused") && (
            <button
              className="ws-btn inline-flex items-center gap-1.5"
              onClick={() => onPause(send.state === "sending")}
              title={send.state === "sending" ? "Pauza" : "Davom ettirish"}
            >
              {send.state === "sending" ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {send.state === "sending" ? "Pauza" : "Davom ettirish"}
            </button>
          )}
          <button
            className="ws-btn ws-btn-danger inline-flex items-center gap-1.5"
            onClick={onCancel}
          >
            <X className="w-3.5 h-3.5" /> Bekor qilish
          </button>
        </>
      ) : (
        <>
          {send.state === "failed" && (
            <button
              className="ws-btn ws-btn-primary inline-flex items-center gap-1.5"
              onClick={onRetry}
            >
              <RotateCw className="w-3.5 h-3.5" /> Qayta urinish
            </button>
          )}
          <button
            className="ws-btn"
            onClick={onClose}
            autoFocus={send.state === "done"}
          >
            {send.state === "done" ? "Yana yuborish" : "Yopish"}
          </button>
        </>
      )}
    </Card>
  );
};

// ---------- receiving ----------

const RECV_TEXT: Record<MacReceive["state"], [Tone, string]> = {
  receiving: ["live", "Qabul qilinmoqda"],
  paused: ["paused", "Yuboruvchi pauza qildi"],
  interrupted: ["warn", "Aloqa uzildi — yuboruvchi kutilmoqda"],
  done: ["done", "Qabul qilindi"],
  failed: ["bad", "Qabul qilib bo'lmadi"],
  cancelled: ["bad", "Bekor qilindi"],
};

interface RecvProps {
  receive: MacReceive;
  myName: string;
  myModel: string;
  speed: number;
  onCancel: () => void;
  onReveal: () => void;
  onClose: () => void;
}

export const ReceiveCard: React.FC<RecvProps> = ({
  receive,
  myName,
  myModel,
  speed,
  onCancel,
  onReveal,
  onClose,
}) => {
  const [tone, headline] = RECV_TEXT[receive.state];
  const note =
    receive.state === "interrupted"
      ? "Qabul qilingan qism saqlangan. Aloqa tiklanishi bilan davom etadi."
      : receive.message;
  const live = ["receiving", "paused", "interrupted"].includes(receive.state);
  const m: CardModel = {
    fromName: receive.from_name,
    fromModel: receive.from_model,
    toName: myName,
    toModel: myModel,
    tone,
    headline,
    note,
    total: receive.total,
    done: receive.done,
    speed,
    files: receive.files,
    elapsedMs: receive.elapsed_ms,
  };
  return (
    <Card m={m}>
      {receive.state === "done" && (
        <button
          className="ws-btn ws-btn-primary inline-flex items-center gap-1.5"
          onClick={onReveal}
          autoFocus
        >
          <FolderOpen className="w-3.5 h-3.5" /> Finder'da ko'rsatish
        </button>
      )}
      {live ? (
        <button
          className="ws-btn ws-btn-danger inline-flex items-center gap-1.5"
          onClick={onCancel}
        >
          <X className="w-3.5 h-3.5" /> Bekor qilish
        </button>
      ) : (
        <button className="ws-btn" onClick={onClose}>
          Yopish
        </button>
      )}
    </Card>
  );
};
