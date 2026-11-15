import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Cable, Settings2, Wifi, WifiOff } from "lucide-react";
import { MacPeer, NetInfo, PeerNet } from "../../types";

/** Real file speed is roughly half the Wi-Fi link rate (radio overhead, both directions share the air) */
export const estimateMBps = (rateMbps: number | null | undefined) =>
  rateMbps ? Math.round((rateMbps * 0.5) / 8) : null;

const signalLabel = (dbm: number | null) => {
  if (dbm === null) return null;
  if (dbm >= -55) return { text: "Signal a'lo", tone: "good" };
  if (dbm >= -67) return { text: "Signal yaxshi", tone: "good" };
  if (dbm >= -75) return { text: "Signal o'rtacha", tone: "warn" };
  return { text: "Signal zaif — routerga yaqinroq o'tiring", tone: "warn" };
};

export const isSlowBand = (band: string | null | undefined) =>
  !!band && band.startsWith("2.4");

const Chip: React.FC<{
  tone?: "good" | "warn" | "plain";
  children: React.ReactNode;
}> = ({ tone = "plain", children }) => (
  <span className={`ws-mac-chip is-${tone}`}>{children}</span>
);

/** One line describing a network: "Wi-Fi · 5 GHz · kanal 44 · 720 Mbit/s" */
export const netSummary = (n: PeerNet | NetInfo | null | undefined) => {
  if (!n) return null;
  if (n.kind === "ethernet") return "Ethernet (kabel)";
  if (n.kind !== "wifi") return "Tarmoqsiz";
  return [
    "Wi-Fi",
    n.band,
    n.channel && `kanal ${n.channel}`,
    n.rate_mbps && `${n.rate_mbps} Mbit/s`,
  ]
    .filter(Boolean)
    .join(" · ");
};

interface Props {
  net: NetInfo | null;
  myName: string;
  /** the selected / only other Mac, to compare bands */
  peer?: MacPeer | null;
}

/** Which network this Mac is on, how fast it is, and what to fix when it is slow */
export const NetworkCard: React.FC<Props> = ({ net, myName, peer }) => {
  if (!net) {
    return (
      <div className="ws-row">
        <span className="text-[12px] text-[var(--ws-label-3)]">
          Tarmoq tekshirilmoqda…
        </span>
      </div>
    );
  }

  if (net.kind === "none") {
    return (
      <div className="ws-row">
        <div className="flex items-center gap-3 text-[13px] text-[var(--ws-red)]">
          <WifiOff className="w-4 h-4" /> {myName} hech qanday tarmoqqa
          ulanmagan. Wi-Fi'ni yoqing.
        </div>
      </div>
    );
  }

  const signal = signalLabel(net.signal_dbm);
  const slowHere = isSlowBand(net.band);
  const peerNet = peer?.net;
  const slowThere = isSlowBand(peerNet?.band);
  const differentChannel =
    net.kind === "wifi" &&
    peerNet?.kind === "wifi" &&
    !!net.channel &&
    !!peerNet.channel &&
    net.channel !== peerNet.channel;
  // the pair is only as fast as the slower Mac
  const rates = [net.rate_mbps, peerNet?.rate_mbps].filter(
    (r): r is number => !!r,
  );
  const pairMBps =
    net.kind === "ethernet" && !peerNet?.rate_mbps
      ? null
      : estimateMBps(rates.length ? Math.min(...rates) : null);

  return (
    <div className="px-[14px] py-3 space-y-2.5 border-t border-[var(--ws-separator)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {net.kind === "ethernet" ? (
            <Cable className="w-4 h-4 shrink-0 text-[var(--ws-green)]" />
          ) : (
            <Wifi
              className={`w-4 h-4 shrink-0 ${slowHere ? "text-[var(--ws-orange)]" : "text-[var(--ws-green)]"}`}
            />
          )}
          <div className="min-w-0">
            <div className="text-[13px] text-white truncate">
              {net.kind === "ethernet"
                ? "Ethernet (kabel) — eng barqaror"
                : (net.ssid ?? "Wi-Fi tarmog'i")}
              {net.kind === "wifi" && !net.ssid && (
                <span className="text-[11px] text-[var(--ws-label-3)]">
                  {" "}
                  · nomini macOS yashiradi
                </span>
              )}
            </div>
            {net.ip && (
              <div className="text-[11px] text-[var(--ws-label-3)] tabular-nums selectable">
                {net.ip}
              </div>
            )}
          </div>
        </div>
        {pairMBps !== null && (
          <div className="text-right shrink-0">
            <div className="text-[15px] font-semibold text-white tabular-nums">
              ~{pairMBps} MB/s
            </div>
            <div className="text-[11px] text-[var(--ws-label-3)]">
              taxminiy · 70 GB ≈{" "}
              {Math.max(1, Math.round((70 * 1024) / pairMBps / 60))} daq
            </div>
          </div>
        )}
      </div>

      {net.kind === "wifi" && (
        <div className="flex flex-wrap gap-1.5">
          {net.band && (
            <Chip tone={slowHere ? "warn" : "good"}>{net.band}</Chip>
          )}
          {net.channel && <Chip>kanal {net.channel}</Chip>}
          {net.standard && <Chip>{net.standard}</Chip>}
          {net.rate_mbps && <Chip>{net.rate_mbps} Mbit/s</Chip>}
          {signal && (
            <Chip tone={signal.tone as "good" | "warn"}>{signal.text}</Chip>
          )}
        </div>
      )}

      {peer && (
        <div className="text-[12px] text-[var(--ws-label-2)]">
          {peer.name}:{" "}
          <span
            className={
              slowThere ? "text-[var(--ws-orange)]" : "text-[var(--ws-label)]"
            }
          >
            {netSummary(peerNet) ?? "ma'lumot yo'q"}
          </span>
        </div>
      )}

      {(slowHere || slowThere) && (
        <div className="ws-mac-warn">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div className="flex-1 text-[12px] leading-relaxed">
            {slowHere ? myName : peer?.name} <b>2.4 GHz</b>'da — bu sekin (~5–10
            MB/s). Routeringizda ikkinchi, odatda «…5G» nomli tarmoq bor: ikkala
            Mac'ni ham o'shanga ulang.
          </div>
          {slowHere && (
            <button
              className="ws-btn shrink-0 inline-flex items-center gap-1.5"
              onClick={() =>
                invoke("maclink_open_wifi_settings").catch(console.error)
              }
            >
              <Settings2 className="w-3.5 h-3.5" /> Wi-Fi sozlamalari
            </button>
          )}
        </div>
      )}
      {!slowHere && !slowThere && differentChannel && (
        <p className="text-[12px] text-[var(--ws-orange)]">
          Ikki Mac har xil kanalda ({net.channel} va {peerNet?.channel}) —
          ehtimol routerning har xil tarmoqlarida. Ikkalasini ham 5G tarmoqqa
          ulang.
        </p>
      )}
    </div>
  );
};
