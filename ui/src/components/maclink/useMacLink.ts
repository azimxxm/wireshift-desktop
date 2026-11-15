import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MacLinkStatus } from "../../types";

const FAST_MS = 500;
const IDLE_MS = 1500;
/** how much a new sample moves the shown speed (0..1) */
const SMOOTHING = 0.35;

const LIVE_SEND = ["connecting", "waiting", "sending", "paused", "reconnecting"];
const LIVE_RECV = ["receiving", "paused", "interrupted"];

export const isSendLive = (s: MacLinkStatus | null) => !!s?.send && LIVE_SEND.includes(s.send.state);
export const isRecvLive = (s: MacLinkStatus | null) => !!s?.receive && LIVE_RECV.includes(s.receive.state);

interface Sample {
  t: number;
  send: number;
  recv: number;
}

export interface MacSpeeds {
  /** bytes per second, smoothed */
  send: number;
  recv: number;
}

/**
 * Polls the Rust side for the whole app (the accept dialog must appear on any page).
 * Fast while something moves, slow when idle.
 */
export const useMacLink = () => {
  const [status, setStatus] = useState<MacLinkStatus | null>(null);
  const [speeds, setSpeeds] = useState<MacSpeeds>({ send: 0, recv: 0 });
  const last = useRef<Sample | null>(null);

  const tick = useCallback(async () => {
    try {
      const s = await invoke<MacLinkStatus>("maclink_status");
      const t = performance.now();
      const send = s.send?.counter ?? 0;
      const recv = s.receive?.counter ?? 0;
      const prev = last.current;
      if (prev) {
        const dt = Math.max((t - prev.t) / 1000, 0.05);
        // counters restart from 0 after a reconnect: treat that sample as 0, not negative
        const rawSend = send >= prev.send ? (send - prev.send) / dt : 0;
        const rawRecv = recv >= prev.recv ? (recv - prev.recv) / dt : 0;
        setSpeeds((h) => ({
          send: s.send?.state === "sending" ? h.send + (rawSend - h.send) * SMOOTHING : 0,
          recv: s.receive?.state === "receiving" ? h.recv + (rawRecv - h.recv) * SMOOTHING : 0,
        }));
      }
      last.current = { t, send, recv };
      setStatus(s);
    } catch (e) {
      console.debug("maclink status poll:", e);
    }
  }, []);

  const busy = isSendLive(status) || isRecvLive(status) || !!status?.request;
  useEffect(() => {
    tick();
    const id = setInterval(tick, busy ? FAST_MS : IDLE_MS);
    return () => clearInterval(id);
  }, [tick, busy]);

  return { status, speeds, refresh: tick };
};

/** "~8 daq", "45 s" */
export const formatEta = (remaining: number, bps: number) => {
  if (bps < 64 * 1024 || remaining <= 0) return "—";
  const secs = Math.round(remaining / bps);
  if (secs < 60) return `${secs} s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `~${mins} daq`;
  return `~${Math.floor(mins / 60)} soat ${mins % 60} daq`;
};

export const formatSpeed = (bps: number) => {
  if (bps < 100 * 1024) return "0 MB/s";
  const mb = bps / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB/s`;
};

export const formatDuration = (ms: number) => {
  const secs = Math.max(Math.round(ms / 1000), 1);
  if (secs < 60) return `${secs} soniya`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} daq ${secs % 60} s`;
  return `${Math.floor(mins / 60)} soat ${mins % 60} daq`;
};
