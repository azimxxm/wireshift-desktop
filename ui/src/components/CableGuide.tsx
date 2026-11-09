import React from "react";
import { formatBytes } from "../utils/format";

export type CableKind = "usb2" | "usb3-5" | "usb3-10" | "thunderbolt";

interface CableSpec {
  id: CableKind;
  name: string;
  marking: string;
  linkMbps: number;
  /** rough real-world MB/s for an iPhone over AFC; USB 2.0 value is what we measure (~38 MB/s) */
  practicalMBs: number;
  note: string;
}

const CABLES: CableSpec[] = [
  {
    id: "usb2",
    name: "Oddiy zaryad kabeli",
    marking: "Belgisiz yoki «480 Mbps», 60W/240W",
    linkMbps: 480,
    practicalMBs: 38,
    note: "iPhone qutisidagi kabel. 240W yozuvi tezlikni bildirmaydi — bu faqat quvvat.",
  },
  {
    id: "usb3-5",
    name: "USB 3 · 5 Gbps",
    marking: "«SS», «5Gbps» yoki «USB 3.0/3.1 Gen 1»",
    linkMbps: 5000,
    practicalMBs: 300,
    note: "Ko'p noutbuk va tashqi disk kabellari.",
  },
  {
    id: "usb3-10",
    name: "USB 3 · 10 Gbps",
    marking: "«SS10», «10Gbps» yoki «USB 3.2 Gen 2»",
    linkMbps: 10000,
    practicalMBs: 600,
    note: "iPhone Pro uchun eng to'g'ri tanlov — maksimal tezlik.",
  },
  {
    id: "thunderbolt",
    name: "Thunderbolt 4/5 · USB4",
    marking: "Chaqmoq ⚡ belgisi, «40Gbps»",
    linkMbps: 10000,
    practicalMBs: 600,
    note: "Ishlaydi, lekin iPhone baribir 10 Gbps dan oshmaydi.",
  },
];

/** Simple USB-C cable drawing; braid colour and plug marking differ per type. */
const CableArt: React.FC<{ kind: CableKind }> = ({ kind }) => {
  const style = {
    usb2: { cable: "#e9e9ec", width: 5, plug: "#f2f2f4", mark: "" },
    "usb3-5": { cable: "#4a4f5a", width: 7, plug: "#2f333b", mark: "SS" },
    "usb3-10": { cable: "#2b5aa8", width: 7, plug: "#22252c", mark: "SS10" },
    thunderbolt: { cable: "#1c1c1f", width: 9, plug: "#1a1a1d", mark: "bolt" },
  }[kind];
  const markColor = kind === "usb2" ? "#9a9aa2" : "#d8dbe2";

  const Plug = ({ x, flip }: { x: number; flip?: boolean }) => (
    <g transform={flip ? `translate(${x} 0) scale(-1 1)` : `translate(${x} 0)`}>
      {/* metal tip */}
      <rect x={-26} y={31} width={14} height={14} rx={4} fill="#c9ccd2" />
      <rect x={-24} y={36} width={10} height={4} rx={2} fill="#7d828c" />
      {/* housing */}
      <rect
        x={-14}
        y={26}
        width={40}
        height={24}
        rx={7}
        fill={style.plug}
        stroke="rgba(255,255,255,0.15)"
      />
      {/* strain relief */}
      <rect x={24} y={32} width={12} height={12} rx={3} fill={style.plug} />
      {style.mark === "bolt" ? (
        <path
          d="M8 31 L2 39 H7 L4 45 L11 36 H6 Z"
          fill="#f5c542"
          transform={flip ? "translate(12 0) scale(-1 1)" : undefined}
        />
      ) : style.mark ? (
        <text
          x={6}
          y={41.5}
          fontSize={style.mark.length > 2 ? 7 : 8}
          fontWeight={700}
          textAnchor="middle"
          fill={markColor}
          fontFamily="-apple-system, sans-serif"
          transform={flip ? "translate(12 0) scale(-1 1)" : undefined}
        >
          {style.mark}
        </text>
      ) : null}
    </g>
  );

  return (
    <svg viewBox="0 0 220 76" className="w-full h-[64px]" aria-hidden>
      <path
        d="M66 38 C 92 6, 128 70, 154 38"
        fill="none"
        stroke={style.cable}
        strokeWidth={style.width}
        strokeLinecap="round"
      />
      {kind === "usb3-10" && (
        // braided look
        <path
          d="M66 38 C 92 6, 128 70, 154 38"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={style.width}
          strokeDasharray="2 3"
        />
      )}
      <Plug x={40} />
      <Plug x={180} flip />
    </svg>
  );
};

const formatDuration = (secs: number) => {
  if (secs < 60) return `${Math.max(Math.round(secs), 1)} s`;
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} daq` : `${Math.floor(m / 60)} soat ${m % 60} daq`;
};

interface CableGuideProps {
  negotiatedMbps: number;
  phoneMaxMbps: number;
  libraryBytes: number;
  /** real measured speed replaces the estimate for the current cable */
  measuredMBs?: number;
}

export const CableGuide: React.FC<CableGuideProps> = ({
  negotiatedMbps,
  phoneMaxMbps,
  libraryBytes,
  measuredMBs,
}) => {
  const currentId: CableKind | null =
    negotiatedMbps >= 10000
      ? "usb3-10"
      : negotiatedMbps >= 5000
        ? "usb3-5"
        : negotiatedMbps > 0
          ? "usb2"
          : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {CABLES.map((c) => {
        // the phone can't go faster than its own port
        const capped = phoneMaxMbps <= 480 && c.linkMbps > 480;
        const speed = capped
          ? CABLES[0].practicalMBs
          : c.id === currentId && measuredMBs
            ? measuredMBs
            : c.practicalMBs;
        const isCurrent = c.id === currentId;
        const best = !capped && c.id === "usb3-10";
        return (
          <div
            key={c.id}
            className={`ws-group p-3.5 flex flex-col ${isCurrent ? "!border-[var(--ws-accent)] !bg-[var(--ws-accent)]/[0.07]" : ""}`}
          >
            <div className="flex items-center justify-between gap-2 h-5">
              <span className="text-[13px] font-semibold text-white">
                {c.name}
              </span>
              {isCurrent ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ws-accent)] text-white">
                  Hozir ulangan
                </span>
              ) : best ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ws-green)]/20 text-[var(--ws-green)]">
                  Tavsiya
                </span>
              ) : null}
            </div>
            <div className="my-1.5 px-2">
              <CableArt kind={c.id} />
            </div>
            <div className="text-[11px] text-[var(--ws-label-2)]">
              Qutisida: {c.marking}
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-[18px] font-semibold tabular-nums text-white">
                ~{Math.round(speed)}{" "}
                <span className="text-[12px] font-normal text-[var(--ws-label-2)]">
                  MB/s
                </span>
              </span>
              {libraryBytes > 0 && (
                <span className="text-[12px] tabular-nums text-[var(--ws-label-2)]">
                  {formatBytes(libraryBytes)} ≈{" "}
                  {formatDuration(libraryBytes / (speed * 1024 * 1024))}
                </span>
              )}
            </div>
            <div className="ws-progress mt-1.5">
              <div
                style={{
                  width: `${Math.max(Math.min(speed / 600, 1) * 100, 4)}%`,
                  background:
                    speed >= 200 ? "var(--ws-green)" : "var(--ws-orange)",
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--ws-label-3)] leading-snug">
              {capped
                ? "Bu iPhone faqat USB 2.0 — bu kabel tezlikni oshirmaydi."
                : c.note}
            </p>
          </div>
        );
      })}
    </div>
  );
};
