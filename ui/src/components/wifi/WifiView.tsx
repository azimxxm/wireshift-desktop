import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { HelpCircle } from "lucide-react";
import { WifiInfo } from "../../types";
import { PageHeader } from "../PageHeader";
import { WifiHelp } from "./WifiHelp";
import { WifiIdleHero, WifiLiveHero } from "./WifiHero";
import { WifiSpeed } from "./WifiSpeed";
import { IncomingList, OutgoingList } from "./WifiLists";
import { useWifiStatus } from "./useWifiStatus";
import "./wifi.css";

interface WifiViewProps {
  /** settings.exportPath; empty = the default export folder */
  exportPath: string;
}

const sessionFolderName = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Wi-Fi ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
};

/** Finder drops: this page is only mounted while visible, so it never steals ImportView's drops. */
const useFileDrop = (onPaths: (paths: string[]) => void) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const handler = useRef(onPaths);
  handler.current = onPaths;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const t = event.payload.type;
        if (t === "enter" || t === "over") setIsDragOver(true);
        else if (t === "leave") setIsDragOver(false);
        else if (t === "drop") {
          setIsDragOver(false);
          handler.current(event.payload.paths);
        }
      })
      .then((fn) => (alive ? (unlisten = fn) : fn()))
      .catch((e) => console.error("drag-drop listener failed:", e));
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return isDragOver;
};

export const WifiView: React.FC<WifiViewProps> = ({ exportPath }) => {
  const { status, speeds, refresh } = useWifiStatus();
  const [info, setInfo] = useState<WifiInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  const running = !!status?.running;
  // info only counts for the session that is running now (a slow poll can't wipe it)
  const liveInfo = info && status?.url === info.url ? info : null;
  // coming back to the page while the server runs: get the QR again
  useEffect(() => {
    if (running && !liveInfo) invoke<WifiInfo | null>("wifi_info").then(setInfo).catch(console.debug);
  }, [running, liveInfo]);

  const start = async () => {
    setStarting(true);
    setError("");
    try {
      setInfo(await invoke<WifiInfo>("wifi_start", { exportDir: exportPath, folderName: sessionFolderName() }));
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    try {
      await invoke("wifi_stop");
    } catch (e) {
      console.debug("wifi stop:", e);
    }
    refresh();
  };

  const addPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      try {
        await invoke("wifi_add_outgoing", { paths });
        refresh();
      } catch (e) {
        console.error("wifi_add_outgoing failed:", e);
      }
    },
    [refresh],
  );
  const isDragOver = useFileDrop(addPaths);

  const pick = async (directory: boolean) => {
    try {
      const picked = await openDialog({
        multiple: true,
        directory,
        title: directory ? "Papkani tanlang" : "Telefonga yuboriladigan fayllar",
      });
      if (picked) addPaths(Array.isArray(picked) ? picked : [picked]);
    } catch (e) {
      console.error("picker error:", e);
    }
  };

  const callAndRefresh = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args).then(refresh).catch((e) => console.error(`${cmd} failed:`, e));

  const openFolder = () => {
    const path = liveInfo?.folder ?? status?.folder;
    if (path) invoke("open_folder_in_finder", { path }).catch((e) => console.error("open folder:", e));
  };

  const hasTraffic = !!status && status.received_total + status.sent_total > 0;

  return (
    <>
      <PageHeader title="Wi-Fi orqali" subtitle="iPhone ↔ Mac · kabelsiz">
        <button className="ws-btn inline-flex items-center gap-1.5" onClick={() => setHelpOpen(true)}>
          <HelpCircle className="w-3.5 h-3.5" /> Qanday ishlaydi?
        </button>
      </PageHeader>
      <WifiHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[760px] mx-auto px-6 py-6 space-y-6">
          {running && liveInfo ? (
            <WifiLiveHero info={liveInfo} status={status} onStop={stop} onOpenFolder={openFolder} />
          ) : (
            <WifiIdleHero status={status} starting={starting} error={error} onStart={start} />
          )}
          {(status?.phone?.connected || hasTraffic) && status && (
            <WifiSpeed speeds={speeds} received={status.received_total} sent={status.sent_total} />
          )}
          <IncomingList items={status?.incoming ?? []} running={running} />
          <OutgoingList
            items={status?.outgoing ?? []}
            isDragOver={isDragOver}
            onPickFiles={() => pick(false)}
            onPickFolder={() => pick(true)}
            onRemove={(id) => callAndRefresh("wifi_remove_outgoing", { id })}
            onClear={() => callAndRefresh("wifi_clear_outgoing")}
          />
          {running && (
            <p className="text-[12px] text-[var(--ws-label-3)] text-center">
              Telefon va Mac bitta Wi-Fi tarmog'ida bo'lishi kerak. Sahifa ochilmasa —{" "}
              <button className="ws-link" onClick={() => setHelpOpen(true)}>
                nima qilish kerak?
              </button>
            </p>
          )}
        </div>
      </div>
    </>
  );
};
