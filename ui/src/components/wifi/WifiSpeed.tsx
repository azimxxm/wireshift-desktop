import React from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { formatBytes } from "../../utils/format";
import { SpeedHistory } from "./useWifiStatus";

const W = 240;
const H = 40;
/** the graph never shrinks below 2 MB/s, so idle noise stays flat */
const MIN_SCALE = 2 * 1024 * 1024;

const sparkPath = (values: number[]) => {
  if (values.length < 2) return { line: "", area: "" };
  const max = Math.max(MIN_SCALE, ...values);
  const step = W / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(H - (v / max) * (H - 4) - 2).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  return { line, area: `${line} L${W},${H} L0,${H} Z` };
};

const splitSpeed = (bps: number) => {
  if (bps < 1024 * 100) return { value: "0", unit: "MB/s" };
  const mb = bps / (1024 * 1024);
  return { value: mb >= 100 ? mb.toFixed(0) : mb.toFixed(1), unit: "MB/s" };
};

const SpeedTile: React.FC<{
  label: string;
  icon: React.ElementType;
  history: number[];
  total: number;
  color: string;
  gradientId: string;
}> = ({ label, icon: Icon, history, total, color, gradientId }) => {
  const { value, unit } = splitSpeed(history.at(-1) ?? 0);
  const { line, area } = sparkPath(history);
  return (
    <div className="ws-group p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ws-label-2)]">
        <span className="inline-flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" style={{ color }} /> {label}
        </span>
        <span className="tabular-nums normal-case tracking-normal font-normal">
          Jami {formatBytes(total)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="ws-wifi-speed">{value}</span>
        <span className="text-[13px] text-[var(--ws-label-2)]">{unit}</span>
      </div>
      <svg className="ws-wifi-spark w-full h-10" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.28 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#${gradientId})`} />}
        {line && <path d={line} fill="none" style={{ stroke: color }} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
};

/** Live in/out speed in big tabular numerals with a one-minute sparkline. */
export const WifiSpeed: React.FC<{ speeds: SpeedHistory; received: number; sent: number }> = ({
  speeds,
  received,
  sent,
}) => (
  <section className="grid grid-cols-2 gap-3">
    <SpeedTile
      label="Telefondan Mac'ga"
      icon={ArrowDownToLine}
      history={speeds.incoming}
      total={received}
      color="var(--ws-accent)"
      gradientId="ws-spark-in"
    />
    <SpeedTile
      label="Mac'dan telefonga"
      icon={ArrowUpFromLine}
      history={speeds.outgoing}
      total={sent}
      color="var(--ws-green)"
      gradientId="ws-spark-out"
    />
  </section>
);
