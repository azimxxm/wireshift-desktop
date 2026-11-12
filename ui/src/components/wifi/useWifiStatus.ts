import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WifiStatus } from "../../types";

const POLL_MS = 600;
const HISTORY = 60;
/** how much a new sample moves the shown speed (0..1) */
const SMOOTHING = 0.4;

export interface SpeedHistory {
  incoming: number[];
  outgoing: number[];
}

interface Sample {
  t: number;
  received: number;
  sent: number;
}

const push = (list: number[], v: number) => [...list.slice(-(HISTORY - 1)), v];

/** Polls the Rust side and turns byte counters into smoothed bytes/second. */
export const useWifiStatus = () => {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [speeds, setSpeeds] = useState<SpeedHistory>({ incoming: [], outgoing: [] });
  const last = useRef<Sample | null>(null);

  const tick = useCallback(async () => {
    try {
      const s = await invoke<WifiStatus>("wifi_status");
      const t = performance.now();
      const prev = last.current;
      if (prev && s.running && s.received_total >= prev.received) {
        const dt = Math.max((t - prev.t) / 1000, 0.05);
        const rawIn = (s.received_total - prev.received) / dt;
        const rawOut = Math.max(s.sent_total - prev.sent, 0) / dt;
        setSpeeds((h) => {
          const lastIn = h.incoming.at(-1) ?? 0;
          const lastOut = h.outgoing.at(-1) ?? 0;
          return {
            incoming: push(h.incoming, lastIn + (rawIn - lastIn) * SMOOTHING),
            outgoing: push(h.outgoing, lastOut + (rawOut - lastOut) * SMOOTHING),
          };
        });
      }
      last.current = { t, received: s.received_total, sent: s.sent_total };
      setStatus(s);
    } catch (e) {
      console.debug("wifi status poll:", e);
    }
  }, []);

  useEffect(() => {
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tick]);

  return { status, speeds, refresh: tick };
};
