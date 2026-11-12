import React, { useState } from "react";
import { Check, Copy, FolderOpen, Loader2, Square, Wifi } from "lucide-react";
import { WifiInfo, WifiStatus } from "../../types";

interface IdleProps {
  status: WifiStatus | null;
  starting: boolean;
  error: string;
  onStart: () => void;
}

const NetworkHint: React.FC<{ lanIp: string | null | undefined }> = ({ lanIp }) =>
  lanIp ? (
    <span className="inline-flex items-center gap-2 text-[12px] text-[var(--ws-label-2)]">
      <span className="ws-wifi-dot is-green" />
      Mac tarmoqda · <span className="selectable tabular-nums">{lanIp}</span> — telefon ham shu Wi-Fi'da
      bo'lishi kerak
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 text-[12px] text-[var(--ws-orange)]">
      <span className="ws-wifi-dot is-orange" />
      Mac hech qanday Wi-Fi tarmog'iga ulanmagan. Wi-Fi'ni yoqing va telefon ulangan tarmoqqa ulang.
    </span>
  );

/** Before the server runs: one clear action. */
export const WifiIdleHero: React.FC<IdleProps> = ({ status, starting, error, onStart }) => (
  <section className="ws-wifi-hero is-idle">
    <div className="ws-wifi-orb">
      <Wifi className="w-10 h-10" strokeWidth={1.8} />
    </div>
    <div className="max-w-[440px] space-y-2">
      <h2 className="ws-wifi-title">iPhone bilan kabelsiz almashing</h2>
      <p className="text-[13px] leading-relaxed text-[var(--ws-label-2)]">
        Tugmani bosing — QR kod chiqadi. iPhone kamerasi bilan skanerlang va rasm, videolarni ikki
        tomonga yuboring. Telefonga ilova o'rnatish shart emas.
      </p>
    </div>
    <button
      className="ws-btn ws-btn-primary ws-btn-large inline-flex items-center gap-2"
      onClick={onStart}
      disabled={starting || status?.lan_ip === null}
      autoFocus
    >
      {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
      Wi-Fi orqali ulanish
    </button>
    {status && <NetworkHint lanIp={status.lan_ip} />}
    {(error || status?.stop_reason) && (
      <p className="text-[12px] text-[var(--ws-orange)] max-w-[480px]">{error || status?.stop_reason}</p>
    )}
  </section>
);

interface LiveProps {
  info: WifiInfo;
  status: WifiStatus | null;
  onStop: () => void;
  onOpenFolder: () => void;
}

const WaitingText: React.FC<{ lastPhone?: string }> = ({ lastPhone }) => (
  <div className="ws-wifi-fade space-y-3">
    <div className="ws-wifi-eyebrow">
      <span className="ws-wifi-dot is-pulse" /> Telefon kutilmoqda
    </div>
    <h2 className="ws-wifi-title">QR kodni iPhone kamerasi bilan skanerlang</h2>
    <ol className="ws-wifi-steps">
      <li>Kamera ilovasini oching va QR kodga qarating</li>
      <li>Chiqqan sariq havolani bosing — sahifa Safari'da ochiladi</li>
      <li>«Mac'ga yuborish» yoki «Mac'dan olish»ni tanlang</li>
    </ol>
    {lastPhone && (
      <p className="text-[12px] text-[var(--ws-label-3)]">
        {lastPhone} sahifasi yopildi yoki ekran o'chdi — sahifani qayta oching.
      </p>
    )}
  </div>
);

const ConnectedText: React.FC<{ label: string; ip: string }> = ({ label, ip }) => (
  <div className="ws-wifi-fade space-y-3">
    <div className="ws-wifi-eyebrow text-[var(--ws-green)]">
      <span className="ws-wifi-dot is-green" /> Ulangan
    </div>
    <h2 className="ws-wifi-title">{label} ulandi</h2>
    <p className="text-[13px] leading-relaxed text-[var(--ws-label-2)]">
      Telefondan «Mac'ga yuborish» bilan rasm va videolarni tanlang yoki pastdagi ro'yxatga fayl
      qo'shing — telefon sahifasida darhol paydo bo'ladi.
    </p>
    <p className="text-[11px] text-[var(--ws-label-3)] tabular-nums selectable">{ip}</p>
  </div>
);

/** Server running: QR hero, then a calm "connected" state once the phone opens the page. */
export const WifiLiveHero: React.FC<LiveProps> = ({ info, status, onStop, onOpenFolder }) => {
  const [copied, setCopied] = useState(false);
  const phone = status?.phone ?? null;
  const connected = !!phone?.connected;
  const folderName = info.folder.split("/").pop() ?? info.folder;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      console.error("copy failed:", e);
    }
  };

  return (
    <section className={`ws-wifi-hero ${connected ? "is-connected" : "is-waiting"}`}>
      <div className="ws-wifi-qr-wrap">
        <span className="ws-wifi-ring" />
        <span className="ws-wifi-ring" />
        <span className="ws-wifi-ring" />
        <div className="ws-wifi-qr">
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(info.qr_svg)}`}
            alt="Telefon uchun QR kod"
            draggable={false}
          />
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {connected && phone ? (
          <ConnectedText key="on" label={phone.label} ip={phone.ip} />
        ) : (
          <WaitingText key="off" lastPhone={phone?.label} />
        )}
        <div className="mt-auto space-y-3">
          <div className="ws-wifi-url">
            <span className="selectable truncate flex-1" title={info.url}>
              {info.url}
            </span>
            <button className="ws-icon-btn shrink-0" onClick={copy} title="Havolani nusxalash">
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[var(--ws-green)]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              className="ws-link text-[12px] inline-flex items-center gap-1.5 min-w-0"
              onClick={onOpenFolder}
              title={info.folder}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{folderName}</span>
            </button>
            <button className="ws-btn inline-flex items-center gap-1.5 shrink-0" onClick={onStop}>
              <Square className="w-3 h-3" /> To'xtatish
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
