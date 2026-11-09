import React, { useState } from "react";
import { Smartphone, Copy, Check, RefreshCw, Info } from "lucide-react";
import { ConnectedDevice } from "../types";
import { PageHeader } from "./PageHeader";
import { formatBytes } from "../utils/format";

interface DiagnosticsViewProps {
  device: ConnectedDevice | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

// Apple region suffix from the model number (MYWN3 + J/A)
const REGIONS: Record<string, string> = {
  "J/A": "Yaponiya — kamera ovozini o'chirib bo'lmaydi",
  "LL/A": "AQSh",
  "ZD/A": "Yevropa",
  "ZP/A": "Gonkong",
  "ZA/A": "Singapur",
  "CH/A": "Xitoy (2 ta jismoniy SIM)",
  "KH/A": "Janubiy Koreya — kamera ovozi doimiy",
  "B/A": "Buyuk Britaniya",
  "X/A": "Avstraliya",
  "RU/A": "Rossiya",
  "AE/A": "BAA",
  "TU/A": "Turkiya",
  "HN/A": "Hindiston",
  "VN/A": "Vyetnam",
  "AA/A": "Yaqin Sharq",
};

const SIM_STATUS: Record<string, string> = {
  kCTSIMSupportSIMStatusReady: "Tayyor",
  kCTSIMSupportSIMStatusNotInserted: "SIM yo'q",
  kCTSIMSupportSIMStatusPINLocked: "PIN bilan qulflangan",
};

const Row: React.FC<{
  label: string;
  value?: React.ReactNode;
  copy?: string | null;
  mono?: boolean;
}> = ({ label, value, copy, mono }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ws-row !min-h-[34px] !py-1.5">
      <span className="text-[13px] text-[var(--ws-label-2)] shrink-0">
        {label}
      </span>
      <span
        className={`selectable flex items-center gap-1.5 text-[13px] text-right min-w-0 ${mono ? "font-mono text-[12px]" : ""}`}
      >
        <span className="truncate">{value ?? "—"}</span>
        {copy && (
          <button
            className="ws-icon-btn !w-5 !h-5 shrink-0"
            title="Nusxalash"
            onClick={() => {
              navigator.clipboard.writeText(copy);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? (
              <Check className="w-3 h-3 text-[var(--ws-green)]" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}
      </span>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    <div className="ws-section-title">{title}</div>
    <div className="ws-group">{children}</div>
  </section>
);

const Meter: React.FC<{ percent: number; color: string }> = ({
  percent,
  color,
}) => (
  <div className="ws-progress !h-1.5">
    <div
      style={{
        width: `${Math.min(Math.max(percent, 0), 100)}%`,
        background: color,
      }}
    />
  </div>
);

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  device,
  onRefresh,
  isRefreshing,
}) => {
  if (!device) {
    return (
      <>
        <PageHeader title="Diagnostika" />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 pb-16">
          <Smartphone
            className="w-8 h-8 text-[var(--ws-label-3)] mb-2"
            strokeWidth={1.4}
          />
          <p className="text-[13px] font-medium text-white">iPhone ulanmagan</p>
          <p className="text-[12px] text-[var(--ws-label-2)]">
            Batareya, xotira va qurilma ma'lumotlari shu yerda chiqadi.
          </p>
        </div>
      </>
    );
  }

  const { battery, storage, details: d } = device;
  const health = battery?.health_percent ?? null;
  const healthColor =
    health === null
      ? "var(--ws-label-3)"
      : health >= 80
        ? "var(--ws-green)"
        : "var(--ws-orange)";
  const usedPct = storage
    ? (storage.used_bytes / storage.total_bytes) * 100
    : 0;
  const model =
    d.model_number && d.region_info
      ? `${d.model_number}${d.region_info}`
      : d.model_number;
  const region = d.region_info ? REGIONS[d.region_info] : undefined;

  return (
    <>
      <PageHeader title="Diagnostika" subtitle={device.name}>
        <button
          className="ws-icon-btn"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Qayta o'qish (⌘R)"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[980px] mx-auto px-6 py-6 space-y-6">
          {/* hero */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/[0.06] flex items-center justify-center">
              <Smartphone className="w-7 h-7" strokeWidth={1.4} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[20px] font-semibold text-white leading-tight">
                {device.marketing_name}
              </h2>
              <p className="text-[12px] text-[var(--ws-label-2)] mt-0.5">
                iOS {device.ios_version}
                {d.build_version && ` (${d.build_version})`}
                {model && ` · ${model}`}
                {storage && ` · ${formatBytes(storage.total_bytes)}`}
              </p>
            </div>
          </div>

          {/* key metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="ws-group p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-[var(--ws-label-2)]">
                  Batareya salomatligi
                </span>
                <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                  {battery?.cycle_count != null
                    ? `${battery.cycle_count} sikl`
                    : ""}
                </span>
              </div>
              <div className="mt-1 mb-3 flex items-baseline gap-2">
                <span
                  className="text-[28px] font-semibold tabular-nums"
                  style={{ color: health === null ? undefined : healthColor }}
                >
                  {health !== null ? `${health}%` : "—"}
                </span>
                {health !== null && (
                  <span className="text-[12px] text-[var(--ws-label-2)]">
                    {health >= 80
                      ? "Yaxshi holatda"
                      : "Almashtirish tavsiya etiladi"}
                  </span>
                )}
              </div>
              <Meter percent={health ?? 0} color={healthColor} />
              <p className="mt-2 text-[11px] text-[var(--ws-label-3)] tabular-nums">
                {battery?.nominal_capacity_mah && battery?.design_capacity_mah
                  ? `${battery.nominal_capacity_mah} / ${battery.design_capacity_mah} mAh (hozirgi / zavod sig'imi)`
                  : "Diagnostika xizmati javob bermadi — telefon ekranini ochib, qayta o'qing."}
              </p>
            </div>

            <div className="ws-group p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-[var(--ws-label-2)]">
                  Xotira
                </span>
                <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                  {storage
                    ? `${formatBytes(storage.available_bytes)} bo'sh`
                    : ""}
                </span>
              </div>
              <div className="mt-1 mb-3 flex items-baseline gap-2">
                <span className="text-[28px] font-semibold tabular-nums text-white">
                  {storage ? formatBytes(storage.used_bytes) : "—"}
                </span>
                {storage && (
                  <span className="text-[12px] text-[var(--ws-label-2)]">
                    / {formatBytes(storage.total_bytes)} band
                  </span>
                )}
              </div>
              <Meter percent={usedPct} color="var(--ws-accent)" />
              <p className="mt-2 text-[11px] text-[var(--ws-label-3)]">
                Tizim qismi va keshlar ham hisobga olingan.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-6 items-start">
            <div className="space-y-6">
              <Section title="Batareya">
                <Row
                  label="Zaryad"
                  value={
                    battery
                      ? `${battery.charge_percent}%${battery.is_charging ? " · quvvatlanmoqda" : ""}`
                      : undefined
                  }
                />
                <Row
                  label="Zaryadlash sikllari"
                  value={battery?.cycle_count ?? undefined}
                />
                <Row
                  label="Hozirgi sig'im"
                  value={
                    battery?.nominal_capacity_mah
                      ? `${battery.nominal_capacity_mah} mAh`
                      : undefined
                  }
                />
                <Row
                  label="Zavod sig'imi"
                  value={
                    battery?.design_capacity_mah
                      ? `${battery.design_capacity_mah} mAh`
                      : undefined
                  }
                />
                <Row
                  label="Kuchlanish"
                  value={
                    battery?.voltage_mv
                      ? `${(battery.voltage_mv / 1000).toFixed(2)} V`
                      : undefined
                  }
                />
                {battery?.adapter_watts ? (
                  <Row
                    label="Quvvat manbai"
                    value={`${battery.adapter_watts} W`}
                  />
                ) : null}
              </Section>

              <Section title="Qurilma">
                <Row label="Model" value={model} copy={model} />
                <Row
                  label="Hudud"
                  value={
                    d.region_info
                      ? `${d.region_info}${region ? ` · ${region}` : ""}`
                      : undefined
                  }
                />
                <Row
                  label="Seriya raqami"
                  value={device.serial_number}
                  copy={device.serial_number}
                  mono
                />
                <Row
                  label="Identifikator"
                  value={`${device.product_type} · ${d.hardware_model ?? ""}`}
                />
                <Row label="Protsessor" value={d.chip} />
                <Row label="Modem dasturi" value={d.baseband_version} />
                <Row label="UDID" value={device.udid} copy={device.udid} mono />
              </Section>
            </div>

            <div className="space-y-6">
              <Section title="Aloqa">
                <Row label="IMEI" value={d.imei} copy={d.imei} mono />
                {d.imei2 && (
                  <Row label="IMEI 2" value={d.imei2} copy={d.imei2} mono />
                )}
                <Row
                  label="Telefon raqami"
                  value={d.phone_number}
                  copy={d.phone_number}
                />
                <Row
                  label="SIM"
                  value={
                    d.sim_status
                      ? (SIM_STATUS[d.sim_status] ?? d.sim_status)
                      : undefined
                  }
                />
                <Row label="Wi‑Fi manzili" value={d.wifi_address} mono />
                <Row label="Bluetooth" value={d.bluetooth_address} mono />
              </Section>

              <Section title="Holat">
                <Row
                  label="Aktivatsiya"
                  value={
                    d.activation_state === "Activated"
                      ? "Faollashtirilgan"
                      : d.activation_state
                  }
                />
                <Row
                  label="Ekran"
                  value={
                    d.screen_locked == null
                      ? undefined
                      : d.screen_locked
                        ? "Qulflangan"
                        : "Ochiq"
                  }
                />
                <Row
                  label="Kompyuterga ishonch"
                  value={device.is_trusted ? "Berilgan" : "Kutilmoqda"}
                />
                <Row label="Kabel" value={device.connection.bus_type} />
                <Row label="Vaqt mintaqasi" value={d.time_zone} />
              </Section>

              <div className="flex gap-2 px-1 text-[11px] text-[var(--ws-label-3)] leading-relaxed">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  Displey, kamera yoki batareya almashtirilganini kabel orqali
                  aniqlab bo'lmaydi. iPhone'da ko'ring: Sozlamalar → Umumiy →
                  Haqida → «Qismlar va servis tarixi».
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
