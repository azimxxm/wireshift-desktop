import React from "react";
import {
  ArrowLeftRight,
  Activity,
  Settings,
  Info,
  RefreshCw,
  Images,
  Gauge,
  Smartphone,
  X,
  Upload,
} from "lucide-react";
import { ConnectedDevice } from "../types";
import { titlebarProps } from "../utils/windowDrag";

export type TabId = "transfer" | "import" | "media" | "cable" | "diagnostics" | "settings";

interface SidebarProps {
  currentTab: TabId;
  setCurrentTab: (tab: TabId) => void;
  onOpenAbout: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  devices: ConnectedDevice[];
  activeUdid?: string;
  onSelectDevice: (udid: string) => void;
  isMigrating: boolean;
  progress: number;
  progressLabel: string;
  onCancel: () => void;
  /** page the progress card opens when clicked */
  progressTab: TabId;
}

const NAV: {
  id: TabId;
  label: string;
  icon: React.ElementType;
  shortcut: string;
}[] = [
  { id: "transfer", label: "Eksport", icon: ArrowLeftRight, shortcut: "⌘1" },
  { id: "import", label: "iPhone'ga yuborish", icon: Upload, shortcut: "⌘2" },
  { id: "media", label: "Galereya", icon: Images, shortcut: "⌘3" },
  { id: "cable", label: "Kabel tezligi", icon: Gauge, shortcut: "⌘4" },
  { id: "diagnostics", label: "Diagnostika", icon: Activity, shortcut: "⌘5" },
];

const SidebarItem: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  title?: string;
  trailing?: React.ReactNode;
}> = ({ active, onClick, icon: Icon, label, title, trailing }) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-full h-7 flex items-center gap-2 px-2 rounded-md text-[13px] transition-colors ${
      active
        ? "bg-white/[0.13] text-white"
        : "text-[var(--ws-label)] hover:bg-white/[0.06]"
    }`}
  >
    <Icon
      className={`w-4 h-4 shrink-0 ${active ? "text-[var(--ws-accent)]" : "text-[var(--ws-label-2)]"}`}
      strokeWidth={1.8}
    />
    <span className="truncate flex-1 text-left">{label}</span>
    {trailing}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenAbout,
  onRefresh,
  isRefreshing,
  devices,
  activeUdid,
  onSelectDevice,
  isMigrating,
  progress,
  progressLabel,
  onCancel,
  progressTab,
}) => (
  <aside className="w-[220px] shrink-0 flex flex-col border-r border-black/40 bg-black/[0.12]">
    {/* traffic-light zone, drags the window like a real titlebar */}
    <div {...titlebarProps} className="h-[52px] shrink-0" />

    <nav className="px-2.5 space-y-0.5">
      {NAV.map((item) => (
        <SidebarItem
          key={item.id}
          active={currentTab === item.id}
          onClick={() => setCurrentTab(item.id)}
          icon={item.icon}
          label={item.label}
          title={`${item.label} (${item.shortcut})`}
        />
      ))}
    </nav>

    <div className="mt-5 px-2.5">
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="text-[11px] font-semibold text-[var(--ws-label-3)]">
          Qurilmalar
        </span>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Qayta skanerlash (⌘R)"
          className="ws-icon-btn !w-5 !h-5"
        >
          <RefreshCw
            className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {devices.length === 0 ? (
        <p className="px-2 py-1 text-[12px] text-[var(--ws-label-3)]">
          iPhone ulanmagan
        </p>
      ) : (
        <div className="space-y-0.5">
          {devices.map((d) => (
            <SidebarItem
              key={d.udid}
              active={d.udid === activeUdid && currentTab === "diagnostics"}
              onClick={() => {
                onSelectDevice(d.udid);
                setCurrentTab("diagnostics");
              }}
              icon={Smartphone}
              label={d.name || d.marketing_name}
              title={`${d.marketing_name} · iOS ${d.ios_version}`}
              trailing={
                d.battery ? (
                  <span className="text-[11px] tabular-nums text-[var(--ws-label-3)]">
                    {d.battery.charge_percent}%
                  </span>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>

    <div className="flex-1" {...titlebarProps} />

    {isMigrating && (
      <div className="mx-2.5 mb-2 p-2.5 rounded-lg bg-white/[0.06] border border-white/[0.06]">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <button
            onClick={() => setCurrentTab(progressTab)}
            className="text-[12px] font-medium text-white truncate text-left"
          >
            {progressLabel}
          </button>
          <button
            onClick={onCancel}
            title="To'xtatish"
            className="ws-icon-btn !w-5 !h-5 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="ws-progress">
          <div style={{ width: `${Math.max(progress, 2)}%` }} />
        </div>
      </div>
    )}

    <div className="px-2.5 pb-3 space-y-0.5">
      <SidebarItem
        active={currentTab === "settings"}
        onClick={() => setCurrentTab("settings")}
        icon={Settings}
        label="Sozlamalar"
        title="Sozlamalar (⌘,)"
      />
      <SidebarItem
        active={false}
        onClick={onOpenAbout}
        icon={Info}
        label="WireShift haqida"
      />
    </div>
  </aside>
);
