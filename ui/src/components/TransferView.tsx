import React, { useState } from "react";
import {
  Smartphone,
  Laptop,
  FolderOpen,
  ChevronRight,
  Check,
  Copy,
  AlertTriangle,
  ShieldAlert,
  BatteryCharging,
  Battery,
  Images,
  Users,
  FileText,
  Cable,
  CheckCircle2,
} from "lucide-react";
import { ConnectedDevice, MediaCatalogSummary } from "../types";
import { PageHeader } from "./PageHeader";
import { formatBytes } from "../utils/format";

type Category = "photos" | "contacts" | "files";

interface TransferViewProps {
  sourceDevice: ConnectedDevice | null;
  targetDevice: ConnectedDevice | null;
  devices: ConnectedDevice[];
  onSelectSource: (udid: string) => void;
  onSelectTarget: (udid: string) => void;
  targetMode: "phone" | "pc";
  onToggleTargetMode: (mode: "phone" | "pc") => void;
  exportPath: string;
  onPickExportPath: () => void;
  onOpenFolder: () => void;
  selectedCategories: Record<Category, boolean>;
  onToggleCategory: (cat: Category) => void;
  dcimCount: number;
  catalog: MediaCatalogSummary | null;
  onStart: () => void;
  onCancel: () => void;
  isMigrating: boolean;
  isExportSuccess: boolean;
  progress: number;
  speedText: string;
  etaText: string;
  copiedCount: number;
  copiedBytes: number;
  currentAlbum: string;
  onOpenGallery: () => void;
  onOpenCableSpeed: () => void;
}

const Checkbox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span className="ws-checkbox" data-checked={checked}>
    {checked && <Check className="w-2.5 h-2.5" strokeWidth={3.5} />}
  </span>
);

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
          <div className="flex items-center gap-2">
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
          </div>
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
          title="Kabel tezligini tekshirish"
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

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 items-center">
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
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--ws-label-2)] tabular-nums self-end">
          <BatteryIcon
            className={`w-4 h-4 ${device.battery?.is_charging ? "text-[var(--ws-green)]" : ""}`}
          />
          {device.battery ? `${device.battery.charge_percent}%` : "—"}
        </div>
      </div>
    </div>
  );
};

export const TransferView: React.FC<TransferViewProps> = (p) => {
  const [migrationType, setMigrationType] = useState<"full" | "selective">(
    "selective",
  );
  const isPcMode = p.targetMode === "pc";
  const hasSource = !!p.sourceDevice;
  const anyCategory =
    p.selectedCategories.photos ||
    p.selectedCategories.contacts ||
    p.selectedCategories.files;
  const canStart = isPcMode
    ? hasSource && !p.isMigrating && anyCategory
    : hasSource && !!p.targetDevice && !p.isMigrating;

  const mediaSubtitle = p.catalog
    ? `${p.catalog.photo_count + p.catalog.video_count} ta · ${formatBytes(p.catalog.photo_bytes + p.catalog.video_bytes)}`
    : p.dcimCount > 0
      ? `${p.dcimCount} ta fayl`
      : "Barcha albomlar";

  const categories: {
    id: Category;
    icon: React.ElementType;
    label: string;
    hint: string;
  }[] = [
    {
      id: "photos",
      icon: Images,
      label: "Rasmlar va videolar",
      hint: mediaSubtitle,
    },
    { id: "contacts", icon: Users, label: "Kontaktlar", hint: "vCard (.vcf)" },
    {
      id: "files",
      icon: FileText,
      label: "Boshqa fayllar",
      hint: "Yozuvlar, yuklamalar",
    },
  ];

  return (
    <>
      <PageHeader title="Eksport">
        <div className="ws-segmented" data-no-drag>
          <button
            aria-pressed={isPcMode}
            disabled={p.isMigrating}
            onClick={() => p.onToggleTargetMode("pc")}
          >
            <Laptop className="w-3.5 h-3.5" /> Mac'ga
          </button>
          <button
            aria-pressed={!isPcMode}
            disabled={p.isMigrating}
            onClick={() => p.onToggleTargetMode("phone")}
          >
            <Smartphone className="w-3.5 h-3.5" /> Boshqa iPhone'ga
          </button>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-6 space-y-6">
          {/* Source */}
          <section>
            <div className="ws-section-title">Manba</div>
            {p.sourceDevice ? (
              <DeviceSummary
                device={p.sourceDevice}
                devices={p.devices}
                onSelect={p.onSelectSource}
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

          {/* Destination */}
          <section>
            <div className="ws-section-title">Manzil</div>
            {isPcMode ? (
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
                      disabled={p.isMigrating}
                    >
                      O'zgartirish…
                    </button>
                    <button className="ws-btn" onClick={p.onOpenFolder}>
                      Finder'da ochish
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ws-group">
                <div className="ws-row">
                  <div className="flex items-center gap-3 min-w-0">
                    <Smartphone className="w-4 h-4 text-[var(--ws-label-2)] shrink-0" />
                    {p.targetDevice ? (
                      p.devices.filter((d) => d.udid !== p.sourceDevice?.udid)
                        .length > 1 ? (
                        <select
                          value={p.targetDevice.udid}
                          onChange={(e) => p.onSelectTarget(e.target.value)}
                          className="ws-field"
                        >
                          {p.devices
                            .filter((d) => d.udid !== p.sourceDevice?.udid)
                            .map((d) => (
                              <option key={d.udid} value={d.udid}>
                                {d.name || d.marketing_name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span>
                          {p.targetDevice.name || p.targetDevice.marketing_name}
                        </span>
                      )
                    ) : (
                      <span className="text-[var(--ws-label-2)]">
                        Ikkinchi iPhone'ni ulang
                      </span>
                    )}
                  </div>
                  <div className="ws-segmented shrink-0">
                    <button
                      aria-pressed={migrationType === "selective"}
                      onClick={() => setMigrationType("selective")}
                    >
                      Rasm va kontakt
                    </button>
                    <button
                      aria-pressed={migrationType === "full"}
                      onClick={() => setMigrationType("full")}
                    >
                      To'liq
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* What to copy */}
          {isPcMode && (
            <section>
              <div className="ws-section-title">Nimalarni ko'chirish</div>
              <div className="ws-group">
                {categories.map((c) => {
                  const checked = p.selectedCategories[c.id];
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      disabled={p.isMigrating}
                      onClick={() => p.onToggleCategory(c.id)}
                      className="ws-row w-full text-left hover:bg-white/[0.03] first:rounded-t-[10px] last:rounded-b-[10px]"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={checked} />
                        <Icon
                          className="w-4 h-4 text-[var(--ws-label-2)]"
                          strokeWidth={1.7}
                        />
                        <span className="text-[13px]">{c.label}</span>
                      </div>
                      <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                        {c.hint}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={p.onOpenGallery}
                  className="ws-row w-full text-left hover:bg-white/[0.03] rounded-b-[10px]"
                >
                  <span className="text-[13px] text-[var(--ws-accent)]">
                    Faqat kerakli rasm va videolarni tanlash…
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--ws-label-3)]" />
                </button>
              </div>
            </section>
          )}

          {/* Progress / action */}
          {p.isMigrating ? (
            <section className="ws-group p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-white font-medium truncate">
                  {isPcMode
                    ? p.currentAlbum
                      ? `${p.currentAlbum} albomi ko'chirilmoqda`
                      : "Fayllar Mac'ga yozilmoqda"
                    : "Telefonlar o'rtasida uzatilmoqda"}
                </span>
                <span className="tabular-nums text-white font-medium">
                  {p.progress}%
                </span>
              </div>
              <div className="ws-progress">
                <div style={{ width: `${Math.max(p.progress, 2)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--ws-label-2)] tabular-nums">
                <span>
                  {p.copiedCount > 0 &&
                    `${p.copiedCount} ta fayl · ${formatBytes(p.copiedBytes)}`}
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
                {p.isExportSuccess ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--ws-green)]">
                    <CheckCircle2 className="w-4 h-4" /> Fayllar muvaffaqiyatli
                    saqlandi.
                    <button className="ws-link ml-1" onClick={p.onOpenFolder}>
                      Ko'rsatish
                    </button>
                  </span>
                ) : !hasSource ? (
                  "Davom etish uchun iPhone ulang."
                ) : !isPcMode && !p.targetDevice ? (
                  "Qabul qiluvchi iPhone'ni ham ulang."
                ) : (
                  "Fayllar asl sifatda (HEIC, ProRes) ko'chiriladi."
                )}
              </div>
              <button
                className="ws-btn ws-btn-primary ws-btn-large shrink-0"
                disabled={!canStart}
                onClick={p.onStart}
              >
                {isPcMode ? "Mac'ga ko'chirish" : "Ko'chirishni boshlash"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
