import React, { useMemo, useState } from "react";
import {
  Smartphone,
  FolderOpen,
  ChevronRight,
  Check,
  Copy,
  AlertTriangle,
  ShieldAlert,
  BatteryCharging,
  Battery,
  Cable,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { ConnectedDevice, MediaCatalogSummary } from "../types";
import type { ExportResult } from "../App";
import { PageHeader } from "./PageHeader";
import { formatBytes } from "../utils/format";

export type ExportScope = "all" | "video" | "photo";

interface TransferViewProps {
  device: ConnectedDevice | null;
  devices: ConnectedDevice[];
  onSelectDevice: (udid: string) => void;
  exportPath: string;
  onPickExportPath: () => void;
  onOpenFolder: () => void;
  catalog: MediaCatalogSummary | null;
  isCatalogLoading: boolean;
  skipExisting: boolean;
  onSkipExistingChange: (v: boolean) => void;
  onStart: (scope: ExportScope) => void;
  onCancel: () => void;
  isExporting: boolean;
  exportResult: ExportResult | null;
  progress: number;
  speedText: string;
  etaText: string;
  copiedCount: number;
  totalCount: number;
  copiedBytes: number;
  onOpenGallery: () => void;
  onOpenCableSpeed: () => void;
}

const DeviceSummary: React.FC<{
  device: ConnectedDevice;
  devices: ConnectedDevice[];
  onSelect: (udid: string) => void;
  onOpenCableSpeed: () => void;
}> = ({ device, devices, onSelect, onOpenCableSpeed }) => {
  const [copied, setCopied] = useState(false);
  const storage = device.storage;
  const usedPct = storage
    ? Math.round((storage.used_bytes / storage.total_bytes) * 100)
    : 0;
  const BatteryIcon = device.battery?.is_charging ? BatteryCharging : Battery;

  return (
    <div className="ws-group p-4">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-[10px] bg-white/[0.06] flex items-center justify-center shrink-0">
          <Smartphone
            className="w-5 h-5 text-[var(--ws-label)]"
            strokeWidth={1.6}
          />
        </div>
        <div className="flex-1 min-w-0">
          {devices.length > 1 ? (
            <select
              value={device.udid}
              onChange={(e) => onSelect(e.target.value)}
              className="ws-field text-[14px] font-semibold"
            >
              {devices.map((d) => (
                <option key={d.udid} value={d.udid}>
                  {d.name || d.marketing_name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="text-[15px] font-semibold text-white truncate">
              {device.name || device.marketing_name}
            </h2>
          )}
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--ws-label-2)]">
            <span>{device.marketing_name}</span>
            <span className="text-[var(--ws-label-3)]">·</span>
            <span>iOS {device.ios_version || "—"}</span>
            {device.serial_number && (
              <>
                <span className="text-[var(--ws-label-3)]">·</span>
                <button
                  className="selectable inline-flex items-center gap-1 hover:text-white"
                  title="Seriya raqamini nusxalash"
                  onClick={() => {
                    navigator.clipboard.writeText(device.serial_number);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                >
                  <span className="font-mono">{device.serial_number}</span>
                  {copied ? (
                    <Check className="w-3 h-3 text-[var(--ws-green)]" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-60" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        <button
          onClick={onOpenCableSpeed}
          title="Kabel tezligi"
          className={`shrink-0 inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-medium ${
            device.connection.is_cable_throttled
              ? "bg-[var(--ws-orange)]/15 text-[var(--ws-orange)]"
              : "bg-white/[0.07] text-[var(--ws-label-2)]"
          }`}
        >
          {device.connection.is_cable_throttled ? (
            <AlertTriangle className="w-3 h-3" />
          ) : (
            <Cable className="w-3 h-3" />
          )}
          {device.connection.bus_type}
        </button>
      </div>

      {!device.is_trusted && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ws-orange)]">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          Telefon ekranini oching va «Ishonish» (Trust) tugmasini bosing.
        </div>
      )}

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 items-end">
        <div>
          <div className="flex justify-between text-[12px] mb-1.5">
            <span className="text-[var(--ws-label-2)]">Xotira</span>
            <span className="tabular-nums text-[var(--ws-label)]">
              {storage
                ? `${formatBytes(storage.used_bytes)} / ${formatBytes(storage.total_bytes)}`
                : "—"}
            </span>
          </div>
          <div className="ws-progress">
            <div style={{ width: `${usedPct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--ws-label-2)] tabular-nums">
          <BatteryIcon
            className={`w-4 h-4 ${device.battery?.is_charging ? "text-[var(--ws-green)]" : ""}`}
          />
          {device.battery ? `${device.battery.charge_percent}%` : "—"}
        </div>
      </div>
    </div>
  );
};

const Radio: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
      checked
        ? "bg-[var(--ws-accent)]"
        : "border border-white/30 bg-white/[0.06]"
    }`}
  >
    {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
  </span>
);

export const TransferView: React.FC<TransferViewProps> = (p) => {
  const [scope, setScope] = useState<ExportScope>("all");

  const stats = useMemo(() => {
    const s = {
      all: { n: 0, b: 0 },
      video: { n: 0, b: 0 },
      photo: { n: 0, b: 0 },
    };
    p.catalog?.items.forEach((i) => {
      if (i.kind === "sidecar") return;
      s.all.n++;
      s.all.b += i.size_bytes;
      if (i.kind === "video" || i.kind === "photo") {
        s[i.kind].n++;
        s[i.kind].b += i.size_bytes;
      }
    });
    return s;
  }, [p.catalog]);

  const options: { id: ExportScope; label: string }[] = [
    { id: "all", label: "Hamma rasm va videolar" },
    { id: "video", label: "Faqat videolar" },
    { id: "photo", label: "Faqat rasmlar" },
  ];

  const canStart =
    !!p.device?.is_trusted &&
    !!p.catalog &&
    !p.isExporting &&
    stats[scope].n > 0;

  const status = (() => {
    if (!p.device) return "Davom etish uchun iPhone ulang.";
    if (!p.device.is_trusted) return "Telefonda «Ishonish»ni bosing.";
    if (p.isCatalogLoading && !p.catalog) return "Telefon xotirasi o'qilmoqda…";
    if (p.skipExisting) return "Mac'da bor fayllar qayta ko'chirilmaydi.";
    return "Albomlar bo'yicha papkalarga, asl sifatda saqlanadi.";
  })();

  return (
    <>
      <PageHeader title="Eksport" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-6 space-y-6">
          <section>
            <div className="ws-section-title">Manba</div>
            {p.device ? (
              <DeviceSummary
                device={p.device}
                devices={p.devices}
                onSelect={p.onSelectDevice}
                onOpenCableSpeed={p.onOpenCableSpeed}
              />
            ) : (
              <div className="ws-group px-4 py-8 flex flex-col items-center text-center">
                <Smartphone
                  className="w-8 h-8 text-[var(--ws-label-3)] mb-2"
                  strokeWidth={1.4}
                />
                <p className="text-[13px] font-medium text-white">
                  iPhone ulanmagan
                </p>
                <p className="text-[12px] text-[var(--ws-label-2)] mt-0.5">
                  Telefonni USB kabel bilan ulang va ekranida «Ishonish»ni
                  bosing.
                </p>
              </div>
            )}
          </section>

          <section>
            <div className="ws-section-title">Saqlash joyi</div>
            <div className="ws-group">
              <div className="ws-row">
                <div className="flex items-center gap-3 min-w-0">
                  <FolderOpen className="w-4 h-4 text-[var(--ws-accent)] shrink-0" />
                  <span
                    className="selectable text-[13px] truncate"
                    title={p.exportPath}
                  >
                    {p.exportPath || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    className="ws-btn"
                    onClick={p.onPickExportPath}
                    disabled={p.isExporting}
                  >
                    O'zgartirish…
                  </button>
                  <button className="ws-btn" onClick={p.onOpenFolder}>
                    Finder'da ochish
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="ws-section-title">Nimalarni ko'chirish</div>
            <div className="ws-group">
              {options.map((o) => (
                <button
                  key={o.id}
                  disabled={p.isExporting}
                  onClick={() => setScope(o.id)}
                  className="ws-row w-full text-left hover:bg-white/[0.03] first:rounded-t-[10px]"
                >
                  <div className="flex items-center gap-3">
                    <Radio checked={scope === o.id} />
                    <span className="text-[13px]">{o.label}</span>
                  </div>
                  <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                    {p.catalog ? (
                      `${stats[o.id].n} ta · ${formatBytes(stats[o.id].b)}`
                    ) : p.isCatalogLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "—"
                    )}
                  </span>
                </button>
              ))}
              <div className="ws-row">
                <div className="min-w-0">
                  <div className="text-[13px]">Faqat yangi fayllar</div>
                  <div className="text-[11px] text-[var(--ws-label-2)] mt-0.5">
                    Shu papkada bor fayllar o'tkazib yuboriladi — keyingi safar
                    tez tugaydi
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={p.skipExisting}
                  aria-label="Faqat yangi fayllar"
                  className="ws-switch"
                  disabled={p.isExporting}
                  onClick={() => p.onSkipExistingChange(!p.skipExisting)}
                />
              </div>
              <button
                onClick={p.onOpenGallery}
                className="ws-row w-full text-left hover:bg-white/[0.03] rounded-b-[10px]"
              >
                <span className="text-[13px] text-[var(--ws-accent)]">
                  Galereyadan bittalab tanlash…
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--ws-label-3)]" />
              </button>
            </div>
          </section>

          {p.isExporting ? (
            <section className="ws-group p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-white font-medium">
                  {p.progress === 0 && p.copiedCount === 0
                    ? "Tayyorlanmoqda…"
                    : "Mac'ga ko'chirilmoqda"}
                </span>
                <span className="tabular-nums text-white font-medium">
                  {p.progress}%
                </span>
              </div>
              <div className="ws-progress">
                <div style={{ width: `${Math.max(p.progress, 1)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--ws-label-2)] tabular-nums">
                <span>
                  {p.totalCount > 0 &&
                    `${p.copiedCount} / ${p.totalCount} ta · ${formatBytes(p.copiedBytes)}`}
                  {p.speedText && ` · ${p.speedText}`}
                  {p.etaText && ` · ${p.etaText} qoldi`}
                </span>
                <button className="ws-btn" onClick={p.onCancel}>
                  To'xtatish
                </button>
              </div>
            </section>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="text-[12px] text-[var(--ws-label-2)] min-w-0">
                {p.exportResult ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--ws-green)]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {p.exportResult.copied > 0
                      ? `${p.exportResult.copied} ta fayl saqlandi${
                          p.exportResult.skipped > 0
                            ? `, ${p.exportResult.skipped} tasi oldin bor edi`
                            : ""
                        }.`
                      : `Yangi fayl yo'q — ${p.exportResult.skipped} tasi oldin saqlangan.`}
                    <button className="ws-link ml-1" onClick={p.onOpenFolder}>
                      Ko'rsatish
                    </button>
                  </span>
                ) : (
                  status
                )}
              </div>
              <button
                className="ws-btn ws-btn-primary ws-btn-large shrink-0"
                disabled={!canStart}
                onClick={() => p.onStart(scope)}
              >
                Mac'ga ko'chirish
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
