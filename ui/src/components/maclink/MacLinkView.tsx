import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowRight,
  Cable,
  File,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  Square,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import { MacLinkStatus, MacPeer, MacPicked, NetInfo } from "../../types";
import { isSlowBand, NetworkCard } from "./NetworkCard";
import { NameEditor } from "./NameEditor";
import { formatBytes } from "../../utils/format";
import { useFileDrop } from "../../hooks/useFileDrop";
import { PageHeader } from "../PageHeader";
import { MacIcon } from "./MacIcon";
import { ReceiveCard, SendCard } from "./TransferCard";
import { isRecvLive, isSendLive, MacSpeeds } from "./useMacLink";
import "./maclink.css";

interface Props {
  status: MacLinkStatus | null;
  speeds: MacSpeeds;
  refresh: () => void;
}

const shortDir = (dir: string) => dir.replace(/^\/Users\/[^/]+/, "~");

const call = (cmd: string, args?: Record<string, unknown>) =>
  invoke(cmd, args).catch((e) => {
    console.error(`${cmd} failed:`, e);
    throw e;
  });

// ---------- nearby Macs ----------

const PeerTile: React.FC<{
  peer: MacPeer;
  selected: boolean;
  onSelect: () => void;
}> = ({ peer, selected, onSelect }) => (
  <button
    className={`ws-mac-peer ${selected ? "is-selected" : ""}`}
    onClick={onSelect}
    aria-pressed={selected}
    title={`${peer.name} · ${peer.model}`}
  >
    <MacIcon model={peer.model} size={64} />
    <span className="ws-mac-peer-name">{peer.name}</span>
    <span className={`ws-mac-peer-meta ${isSlowBand(peer.net?.band) ? "is-slow" : ""}`}>
      {peer.cable ? (
        <Cable className="w-3 h-3" />
      ) : (
        <Wifi className="w-3 h-3" />
      )}
      {peer.cable
        ? "Kabel"
        : peer.net?.kind === "ethernet"
          ? "Ethernet"
          : (peer.net?.band ?? peer.model)}
    </span>
  </button>
);

const Searching: React.FC<{ myName: string; myModel: string }> = ({
  myName,
  myModel,
}) => (
  <div className="flex flex-col items-center text-center gap-4 py-4">
    <div className="ws-mac-radar">
      <span />
      <span />
      <span />
      <MacIcon model={myModel} size={52} />
    </div>
    <div className="space-y-1.5">
      <h2 className="ws-mac-title">Boshqa Mac qidirilmoqda…</h2>
      <p className="text-[13px] text-[var(--ws-label-2)]">
        {myName} tarmoqda ko'rinib turibdi.
      </p>
    </div>
    <p className="text-[12px] text-[var(--ws-label-3)] max-w-[420px]">
      Ikkinchi Mac'da ham WireShift ochilib, «Boshlash» bosilgan bo'lishi kerak.
      Ikkalasi bitta Wi-Fi tarmog'ida bo'lsin.
    </p>
  </div>
);

// ---------- before "Boshlash" ----------

const RULES = [
  "Ikkala Mac bitta Wi-Fi tarmog'ida (bitta routerda) bo'lsin",
  "Router 2.4 va 5 GHz tarmoq bersa — ikkala Mac'ni ham 5 GHz (…5G) tarmoqqa ulang: 5–10 marta tez",
  "Ikkala Mac'da WireShift ochiq va «Boshlash» bosilgan bo'lsin",
  "Birinchi marta «Local Network» ruxsati so'raladi — «Allow» bosing",
  "Yuborish vaqtida Mac uxlamaydi, lekin noutbuk qopqog'ini yopmang va quvvatga ulang",
  "Mehmon / jamoat Wi-Fi'larida qurilmalar bir-birini ko'rmasligi mumkin",
];

const IdleIntro: React.FC<{
  myModel: string;
  starting: boolean;
  error: string | null;
  canStart: boolean;
  onStart: () => void;
}> = ({ myModel, starting, error, canStart, onStart }) => (
  <section className="ws-mac-stage flex flex-col items-center text-center gap-5">
    <div className="ws-mac-pair" aria-hidden>
      <MacIcon model={myModel} size={56} />
      <span className="ws-mac-pair-line" />
      <MacIcon model={myModel.toLowerCase().includes("macbook") ? "Mac mini" : "MacBook Pro"} size={56} />
    </div>
    <div className="space-y-2 max-w-[480px]">
      <h2 className="ws-mac-title">Ikki Mac o'rtasida katta fayllar</h2>
      <p className="text-[13px] leading-relaxed text-[var(--ws-label-2)]">
        Wi-Fi orqali istalgan hajmdagi fayl va papkalarni yuboring. File Sharing, parol yoki sozlama kerak emas.
        Aloqa uzilsa — to'xtagan joyidan davom etadi.
      </p>
    </div>
    <ol className="ws-mac-steps max-w-[520px]">
      {RULES.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ol>
    <button
      className="ws-btn ws-btn-primary ws-btn-large inline-flex items-center gap-2"
      onClick={onStart}
      disabled={starting || !canStart}
      autoFocus
    >
      {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
      Boshlash
    </button>
    {error && <p className="text-[12px] text-[var(--ws-orange)] max-w-[480px]">{error}</p>}
  </section>
);

// ---------- what to send ----------

interface ComposeProps {
  peer: MacPeer;
  items: MacPicked[];
  inspecting: boolean;
  isDragOver: boolean;
  sending: boolean;
  error: string;
  onPick: (dir: boolean) => void;
  onRemove: (path: string) => void;
  onClear: () => void;
  onSend: () => void;
}

const Compose: React.FC<ComposeProps> = ({
  peer,
  items,
  inspecting,
  isDragOver,
  sending,
  error,
  onPick,
  onRemove,
  onClear,
  onSend,
}) => {
  const total = items.reduce((a, i) => a + i.size, 0);
  const files = items.reduce((a, i) => a + i.files, 0);

  if (items.length === 0) {
    return (
      <section className={`ws-mac-drop ${isDragOver ? "is-over" : ""}`}>
        <div className="ws-mac-drop-icon">
          {inspecting ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : (
            <Upload className="w-7 h-7" strokeWidth={1.7} />
          )}
        </div>
        <h3 className="text-[15px] font-semibold text-white">
          Fayl yoki papkalarni shu yerga tashlang
        </h3>
        <p className="text-[12px] text-[var(--ws-label-2)]">
          {peer.name}'ga yuboriladi · hajm cheklanmagan
        </p>
        <div className="flex gap-2 mt-1">
          <button
            className="ws-btn inline-flex items-center gap-1.5"
            onClick={() => onPick(false)}
          >
            <File className="w-3.5 h-3.5" /> Fayllar…
          </button>
          <button
            className="ws-btn inline-flex items-center gap-1.5"
            onClick={() => onPick(true)}
          >
            <Folder className="w-3.5 h-3.5" /> Papka…
          </button>
        </div>
        {error && (
          <p className="text-[12px] text-[var(--ws-orange)]">{error}</p>
        )}
      </section>
    );
  }

  return (
    <section className={`ws-group ws-mac-list ${isDragOver ? "is-over" : ""}`}>
      <div className="max-h-[260px] overflow-y-auto">
        {items.map((i) => (
          <div key={i.path} className="ws-row !min-h-[44px] group">
            <div className="min-w-0 flex items-center gap-3">
              {i.is_dir ? (
                <Folder
                  className="w-5 h-5 shrink-0 text-[var(--ws-accent)]"
                  strokeWidth={1.7}
                />
              ) : (
                <File
                  className="w-5 h-5 shrink-0 text-[var(--ws-label-2)]"
                  strokeWidth={1.7}
                />
              )}
              <div className="min-w-0">
                <div className="text-[13px] text-white truncate" title={i.path}>
                  {i.name}
                </div>
                <div className="text-[11px] text-[var(--ws-label-3)] tabular-nums">
                  {i.is_dir ? `${i.files.toLocaleString("ru-RU")} ta fayl · ` : ""}
                  {formatBytes(i.size)}
                </div>
              </div>
            </div>
            <button
              className="ws-icon-btn shrink-0 opacity-60 group-hover:opacity-100"
              onClick={() => onRemove(i.path)}
              title="Ro'yxatdan olib tashlash"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="ws-row border-t border-[var(--ws-separator)] !py-3">
        <div className="flex items-center gap-1">
          <button
            className="ws-btn inline-flex items-center gap-1.5"
            onClick={() => onPick(false)}
            title="Yana fayl qo'shish"
          >
            <Plus className="w-3.5 h-3.5" /> Qo'shish
          </button>
          <button className="ws-link text-[12px] px-2" onClick={onClear}>
            Tozalash
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
            {files.toLocaleString("ru-RU")} ta fayl ·{" "}
            <b className="text-white font-semibold">{formatBytes(total)}</b>
          </span>
          <button
            className="ws-btn ws-btn-primary ws-btn-large inline-flex items-center gap-2"
            onClick={onSend}
            disabled={sending || inspecting}
            autoFocus
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {peer.name}'ga yuborish
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      {error && (
        <p className="px-4 pb-3 text-[12px] text-[var(--ws-orange)]">{error}</p>
      )}
    </section>
  );
};

// ---------- page ----------

export const MacLinkView: React.FC<Props> = ({ status, speeds, refresh }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<MacPicked[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [net, setNet] = useState<NetInfo | null>(null);
  const [toggling, setToggling] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // network details refresh while this page is open (the Rust side caches ~10 s)
  useEffect(() => {
    let alive = true;
    const load = () =>
      invoke<NetInfo | null>("maclink_network")
        .then((n) => alive && n && setNet(n))
        .catch((e) => console.debug("maclink_network:", e));
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const toggleService = async (on: boolean) => {
    setToggling(true);
    setServiceError(null);
    try {
      await invoke(on ? "maclink_start" : "maclink_stop");
    } catch (e) {
      setServiceError(String(e));
    } finally {
      setToggling(false);
      refresh();
    }
  };

  const peers = status?.peers ?? [];
  const me = status?.me;
  // one Mac nearby -> it is the obvious target
  const selected =
    peers.find((p) => p.id === selectedId) ??
    (peers.length === 1 ? peers[0] : null);
  const send = status?.send ?? null;
  const receive = status?.receive ?? null;
  const sendLive = isSendLive(status);

  const addPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    setInspecting(true);
    setError("");
    try {
      const picked = await invoke<MacPicked[]>("maclink_inspect", { paths });
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.path));
        return [...prev, ...picked.filter((p) => !seen.has(p.path))];
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setInspecting(false);
    }
  }, []);
  const isDragOver = useFileDrop((paths) => {
    if (!sendLive) addPaths(paths);
  });

  const pick = async (directory: boolean) => {
    try {
      const picked = await openDialog({
        multiple: true,
        directory,
        title: directory ? "Yuboriladigan papkalar" : "Yuboriladigan fayllar",
      });
      if (picked) addPaths(Array.isArray(picked) ? picked : [picked]);
    } catch (e) {
      console.error("picker error:", e);
    }
  };

  const startSend = async () => {
    if (!selected || items.length === 0) return;
    setStarting(true);
    setError("");
    try {
      await invoke("maclink_send", {
        peerId: selected.id,
        paths: items.map((i) => i.path),
      });
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };

  // a finished send clears the list, so "Yana yuborish" starts fresh
  useEffect(() => {
    if (send?.state === "done") setItems([]);
  }, [send?.state]);

  const closeFinished = () =>
    call("maclink_clear_finished")
      .then(refresh)
      .catch(() => {});

  const pickReceiveDir = async () => {
    try {
      const dir = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: me?.receive_dir,
        title: "Qabul qilingan fayllar papkasi",
      });
      if (typeof dir === "string")
        await call("maclink_set_receive_dir", { dir });
      refresh();
    } catch (e) {
      console.error("receive dir:", e);
    }
  };

  const myName = me?.name ?? "Bu Mac";
  const myModel = me?.model ?? "Mac";

  return (
    <>
      <PageHeader title="Mac ↔ Mac" subtitle="Wi-Fi orqali · sozlamasiz" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[760px] mx-auto px-6 py-6 space-y-5">
          {receive && (
            <ReceiveCard
              receive={receive}
              myName={myName}
              myModel={myModel}
              speed={speeds.recv}
              onCancel={() =>
                call("maclink_cancel_receive")
                  .then(refresh)
                  .catch(() => {})
              }
              onReveal={() => call("maclink_reveal_received").catch(() => {})}
              onClose={closeFinished}
            />
          )}

          {!me?.online && !send ? (
            <IdleIntro
              myModel={myModel}
              starting={toggling || !!me?.starting}
              error={serviceError ?? me?.error ?? null}
              canStart={!!me && net?.kind !== "none"}
              onStart={() => toggleService(true)}
            />
          ) : send ? (
            <SendCard
              send={send}
              myName={myName}
              myModel={myModel}
              speed={speeds.send}
              onPause={(p) => call("maclink_pause", { paused: p }).then(refresh).catch(() => {})}
              onCancel={() => call("maclink_cancel_send").then(refresh).catch(() => {})}
              onRetry={() => call("maclink_retry_send").then(refresh).catch(() => {})}
              onClose={closeFinished}
            />
          ) : (
            <>
              <section className="ws-mac-stage">
                {peers.length === 0 ? (
                  <Searching myName={myName} myModel={myModel} />
                ) : (
                  <>
                    <div className="flex items-baseline justify-between mb-4">
                      <h2 className="ws-mac-title">Qaysi Mac'ga yuboramiz?</h2>
                      <span className="text-[12px] text-[var(--ws-label-3)]">{peers.length} ta Mac yaqinda</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {peers.map((p) => (
                        <PeerTile key={p.id} peer={p} selected={selected?.id === p.id} onSelect={() => setSelectedId(p.id)} />
                      ))}
                    </div>
                  </>
                )}
              </section>

              {selected && (
                <Compose
                  peer={selected}
                  items={items}
                  inspecting={inspecting}
                  isDragOver={isDragOver}
                  sending={starting}
                  error={error}
                  onPick={pick}
                  onRemove={(path) => setItems((prev) => prev.filter((i) => i.path !== path))}
                  onClear={() => setItems([])}
                  onSend={startSend}
                />
              )}
            </>
          )}
          <section className="ws-group">
            <div className="ws-row">
              <div className="min-w-0 flex items-center gap-3">
                <MacIcon
                  model={myModel}
                  size={28}
                  className="text-[var(--ws-label-2)] shrink-0"
                />
                <div className="min-w-0">
                  <NameEditor name={myName} onSaved={refresh} />
                  <div className="text-[11px] text-[var(--ws-label-3)] flex items-center gap-1.5">
                    <span
                      className={`ws-mac-dot ${me?.online ? "is-green" : "is-orange"}`}
                    />
                    {me?.online
                      ? "Yoqilgan — boshqa Mac'lar sizni ko'radi va yubora oladi"
                      : "O'chiq — boshqa Mac'lar sizni ko'rmaydi"}
                  </div>
                </div>
              </div>
              {me?.online ? (
                <button
                  className="ws-btn shrink-0 inline-flex items-center gap-1.5"
                  onClick={() => toggleService(false)}
                  disabled={toggling || isSendLive(status) || isRecvLive(status)}
                  title={isSendLive(status) || isRecvLive(status) ? "Avval yuborishni tugating" : "Tarmoqdan yashirinish"}
                >
                  <Square className="w-3 h-3" /> To'xtatish
                </button>
              ) : null}
            </div>
            {me?.online && serviceError && (
              <div className="ws-row text-[12px] text-[var(--ws-orange)]">{serviceError}</div>
            )}
            <NetworkCard net={net ?? me?.net ?? null} myName={myName} peer={selected ?? (peers.length === 1 ? peers[0] : null)} />
            <div className="ws-row">
              <div className="min-w-0">
                <div className="text-[13px] text-[var(--ws-label)]">
                  Qabul qilingan fayllar
                </div>
                <div
                  className="text-[11px] text-[var(--ws-label-3)] truncate"
                  title={me?.receive_dir}
                >
                  {me ? shortDir(me.receive_dir) : "—"}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="ws-icon-btn"
                  title="Finder'da ochish"
                  onClick={() =>
                    me &&
                    call("open_folder_in_finder", {
                      path: me.receive_dir,
                    }).catch(() => {})
                  }
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                <button className="ws-btn" onClick={pickReceiveDir}>
                  O'zgartirish…
                </button>
              </div>
            </div>
            {(status?.trusted.length ?? 0) > 0 && (
              <div className="ws-row">
                <div className="min-w-0">
                  <div className="text-[13px] text-[var(--ws-label)]">
                    Ishonchli Mac'lar
                  </div>
                  <div className="text-[11px] text-[var(--ws-label-3)] truncate">
                    {status?.trusted.join(", ")} — so'ramasdan qabul qilinadi
                  </div>
                </div>
                <button
                  className="ws-btn shrink-0"
                  onClick={() =>
                    call("maclink_forget_trusted")
                      .then(refresh)
                      .catch(() => {})
                  }
                >
                  Unutish
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
};
