import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Cable,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  ConnectedDevice,
  CableDiagnostic,
  CableBenchmarkResult,
  MediaCatalogSummary,
} from "../types";
import { PageHeader } from "./PageHeader";
import { CableGuide } from "./CableGuide";
import { formatBytes } from "../utils/format";

interface CableSpeedViewProps {
  device: ConnectedDevice | null;
  catalog: MediaCatalogSummary | null;
}

const linkLabel = (mbps: number) =>
  mbps >= 10000
    ? "USB 3 · 10 Gbps"
    : mbps >= 5000
      ? "USB 3 · 5 Gbps"
      : mbps > 0
        ? `USB 2.0 · ${mbps} Mbps`
        : "Aniqlanmadi";

const formatDuration = (secs: number) => {
  if (secs < 60) return `${Math.max(Math.round(secs), 1)} soniya`;
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} daqiqa` : `${Math.floor(m / 60)} soat ${m % 60} daqiqa`;
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="ws-row !min-h-[36px]">
    <span className="text-[13px] text-[var(--ws-label-2)]">{label}</span>
    <span className="text-[13px] tabular-nums text-right">{value}</span>
  </div>
);

export const CableSpeedView: React.FC<CableSpeedViewProps> = ({
  device,
  catalog,
}) => {
  const [diag, setDiag] = useState<CableDiagnostic | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bench, setBench] = useState<CableBenchmarkResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [benchError, setBenchError] = useState<string | null>(null);

  const loadDiagnostic = async () => {
    if (!device) return;
    setIsLoading(true);
    try {
      setDiag(
        await invoke<CableDiagnostic>("diagnose_cable_speed", {
          udid: device.udid,
          productType: device.product_type,
        }),
      );
    } catch (e) {
      console.error("Cable diagnostic error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setDiag(null);
    setBench(null);
    loadDiagnostic();
  }, [device?.udid]);

  const runBenchmark = async () => {
    if (!device || isRunning) return;
    setIsRunning(true);
    setBenchError(null);
    try {
      setBench(
        await invoke<CableBenchmarkResult>("run_cable_benchmark", {
          udid: device.udid,
        }),
      );
    } catch (e) {
      setBenchError(typeof e === "string" ? e : "Tezlikni o'lchab bo'lmadi.");
    } finally {
      setIsRunning(false);
    }
  };

  if (!device) {
    return (
      <>
        <PageHeader title="Kabel tezligi" />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 pb-16">
          <Cable
            className="w-8 h-8 text-[var(--ws-label-3)] mb-2"
            strokeWidth={1.4}
          />
          <p className="text-[13px] font-medium text-white">iPhone ulanmagan</p>
          <p className="text-[12px] text-[var(--ws-label-2)]">
            Kabel tezligini bilish uchun telefonni ulang.
          </p>
        </div>
      </>
    );
  }

  const usb3Phone =
    (diag?.device_max_mbps ?? device.connection.max_bandwidth_mbps) > 480;
  const negotiated =
    diag?.negotiated_speed_mbps ?? device.connection.negotiated_speed_mbps;
  const throttled =
    diag?.is_cable_throttled ?? device.connection.is_cable_throttled;
  const fast = negotiated >= 5000;

  const verdict = fast
    ? {
        icon: CheckCircle2,
        color: "var(--ws-green)",
        title: "Kabel to'liq tezlikda ishlayapti",
        text: "Telefon USB 3 tezligida ulangan.",
      }
    : throttled
      ? {
          icon: AlertTriangle,
          color: "var(--ws-orange)",
          title: "Kabel tezlikni cheklayapti",
          text: `${device.marketing_name} USB 3 (10 Gbps) ni qo'llaydi, lekin bu kabel faqat USB 2.0 beradi. USB 3 yoki Thunderbolt kabel bilan ko'chirish taxminan 10 barobar tezlashadi.`,
        }
      : {
          icon: Info,
          color: "var(--ws-label-2)",
          title: "Bu telefon uchun maksimal tezlik",
          text: `${device.marketing_name} faqat USB 2.0 (480 Mbps) ni qo'llaydi — boshqa kabel tezlikni oshirmaydi.`,
        };
  const VerdictIcon = verdict.icon;

  // Real-measured speed beats the theoretical one for time estimates
  const libraryBytes = catalog?.total_bytes ?? device.storage?.used_bytes ?? 0;
  const estimateSecs =
    bench && bench.speed_mb_s > 0
      ? libraryBytes / (bench.speed_mb_s * 1024 * 1024)
      : null;

  return (
    <>
      <PageHeader title="Kabel tezligi" subtitle={device.name}>
        <button
          className="ws-icon-btn"
          onClick={loadDiagnostic}
          disabled={isLoading}
          title="Qayta tekshirish"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-6 space-y-6">
          <div className="ws-group p-4 flex gap-3">
            <VerdictIcon
              className="w-5 h-5 shrink-0 mt-0.5"
              style={{ color: verdict.color }}
            />
            <div>
              <div className="text-[14px] font-semibold text-white">
                {verdict.title}
              </div>
              <p className="text-[12px] text-[var(--ws-label-2)] mt-1 leading-relaxed">
                {verdict.text}
              </p>
            </div>
          </div>

          <section>
            <div className="ws-section-title">Ulanish</div>
            <div className="ws-group">
              <Row
                label="Hozirgi ulanish"
                value={
                  <span
                    style={{
                      color: throttled ? "var(--ws-orange)" : undefined,
                    }}
                  >
                    {linkLabel(negotiated)}
                  </span>
                }
              />
              <Row
                label="Telefon qo'llaydigan maksimum"
                value={usb3Phone ? "USB 3 · 10 Gbps" : "USB 2.0 · 480 Mbps"}
              />
              <Row label="Mac" value={diag?.mac_model ?? "—"} />
            </div>
          </section>

          <section>
            <div className="ws-section-title">Haqiqiy tezlik testi</div>
            <div className="ws-group">
              <div className="ws-row">
                <div className="min-w-0">
                  <div className="text-[13px]">
                    Telefondan 64 MB o'qib o'lchash
                  </div>
                  <div className="text-[11px] text-[var(--ws-label-2)] mt-0.5">
                    Faqat o'qiladi — telefonga ham, Mac'ga ham hech narsa
                    yozilmaydi.
                  </div>
                </div>
                <button
                  className="ws-btn ws-btn-primary shrink-0"
                  onClick={runBenchmark}
                  disabled={isRunning}
                >
                  {isRunning ? "O'lchanmoqda…" : "O'lchash"}
                </button>
              </div>
              {bench && (
                <>
                  <Row
                    label="O'lchangan tezlik"
                    value={
                      <span className="text-[15px] font-semibold text-white">
                        {bench.speed_mb_s} MB/s
                        <span className="text-[12px] font-normal text-[var(--ws-label-2)]">
                          {" "}
                          · {bench.transferred_mb} MB / {bench.elapsed_seconds}{" "}
                          s
                        </span>
                      </span>
                    }
                  />
                  {estimateSecs !== null && libraryBytes > 0 && (
                    <Row
                      label={`Butun galereya (${formatBytes(libraryBytes)})`}
                      value={`≈ ${formatDuration(estimateSecs)}`}
                    />
                  )}
                </>
              )}
              {benchError && (
                <div className="ws-row">
                  <span className="text-[12px] text-[var(--ws-red)]">
                    {benchError}
                  </span>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="ws-section-title">Qaysi kabel qancha tezlik beradi</div>
            <CableGuide
              negotiatedMbps={negotiated}
              phoneMaxMbps={usb3Phone ? 10000 : 480}
              libraryBytes={libraryBytes}
              measuredMBs={bench?.speed_mb_s}
            />
            <p className="mt-2 px-1 text-[11px] text-[var(--ws-label-3)]">
              USB 3 tezliklari taxminiy — amalda telefon xotirasi va Mac'ga bog'liq. Hozirgi kabel uchun «O'lchash» natijasi ishlatiladi.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};
