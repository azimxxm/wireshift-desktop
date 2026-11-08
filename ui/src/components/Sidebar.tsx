import React from 'react'
import {
  ArrowLeftRight,
  Activity,
  Clock,
  Settings,
  Info,
  RefreshCw,
  Film,
  Gauge,
  Smartphone,
  Laptop
} from 'lucide-react'
import { handleWindowDrag, handleWindowDoubleClick } from '../utils/windowDrag'

interface SidebarProps {
  currentTab: string
  setCurrentTab: (tab: string) => void
  onOpenAbout: () => void
  onRefresh: () => void
  isRefreshing: boolean
  deviceCount: number
  isMigrating?: boolean
  progress?: number
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenAbout,
  onRefresh,
  isRefreshing,
  deviceCount,
  isMigrating = false,
  progress = 0,
}) => {
  const navItems = [
    { id: 'transfer', label: 'Eksport & Transfer', icon: ArrowLeftRight },
    { id: 'media', label: 'Rasmlar & Videolar', icon: Film },
    { id: 'cable', label: 'Kabel & Port Tezligi', icon: Gauge },
    { id: 'diagnostics', label: 'Uskuna Diagnostikasi', icon: Activity },
    { id: 'history', label: 'Tarix & Jurnal', icon: Clock },
    { id: 'settings', label: 'Sozlamalar', icon: Settings },
  ]

  return (
    <aside className="w-64 bg-[#121317]/90 backdrop-blur-2xl border-r border-white/[0.08] flex flex-col justify-between select-none pb-4 z-20">
      {/* Top Header & Traffic Lights Clearance Region */}
      <div>
        <div
          data-tauri-drag-region
          onMouseDown={handleWindowDrag}
          onDoubleClick={handleWindowDoubleClick}
          className="h-16 border-b border-white/[0.06] flex items-center justify-between pl-[88px] pr-4 cursor-default select-none"
        >
          {/* Logo & Brand (Cleanly spaced after the 88px traffic lights zone) */}
          <div className="flex items-center gap-2.5 pointer-events-none">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#0A84FF] to-[#5E5CE6] p-0.5 shadow-md flex items-center justify-center overflow-hidden border border-white/20">
              <img src="/app-icon.png" alt="Icon" className="w-full h-full object-cover rounded-[7px]" />
            </div>
            <div>
              <h1 className="text-[13px] font-semibold text-white tracking-tight leading-none">WireShift</h1>
              <p className="text-[9px] text-[#0A84FF] font-medium tracking-wide mt-0.5">HIGH-SPEED SYNC</p>
            </div>
          </div>

          {/* Minimalist Apple Glass Refresh Button */}
          <button
            onClick={onRefresh}
            title="Qurilmalarni qayta skanerlash"
            disabled={isRefreshing}
            className={`p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-all border border-transparent hover:border-white/[0.08] cursor-pointer ${
              isRefreshing ? 'animate-spin text-[#0A84FF]' : ''
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Live Device Status Pill */}
        <div className="px-3 pt-3.5 mb-2">
          <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs">
            <span className="text-white/60 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  deviceCount > 0 ? 'bg-[#30D158] shadow-[0_0_8px_#30D158]' : 'bg-white/30'
                }`}
              />
              <span className="text-[11px] font-medium">Ulangan Qurilmalar</span>
            </span>
            <span className="font-mono text-xs font-semibold text-white bg-white/[0.06] px-2 py-0.5 rounded-md">
              {deviceCount} ta
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0A84FF]/12 text-[#0A84FF] font-semibold border border-[#0A84FF]/25 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05] font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#0A84FF]' : 'text-white/40'}`} />
                  <span>{item.label}</span>
                </div>

                {/* Migration active indicator */}
                {isMigrating && (item.id === 'transfer' || item.id === 'media') && (
                  <span className="text-[10px] font-mono font-bold text-[#0A84FF] bg-[#0A84FF]/20 px-1.5 py-0.5 rounded-full border border-[#0A84FF]/30">
                    {progress}%
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom Info & About WireShift */}
      <div className="px-3 pt-3 border-t border-white/[0.06]">
        <button
          onClick={onOpenAbout}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-white/50 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer font-medium"
        >
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5" />
            <span>WireShift haqida</span>
          </div>
          <span className="text-[10px] font-mono text-white/40">v1.0</span>
        </button>
      </div>
    </aside>
  )
}
