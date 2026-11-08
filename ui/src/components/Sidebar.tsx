import React from 'react'
import { ArrowLeftRight, Activity, Clock, Settings, Info, RefreshCw } from 'lucide-react'

interface SidebarProps {
  currentTab: string
  setCurrentTab: (tab: string) => void
  onOpenAbout: () => void
  onRefresh: () => void
  isRefreshing: boolean
  deviceCount: number
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenAbout,
  onRefresh,
  isRefreshing,
  deviceCount,
}) => {
  const navItems = [
    { id: 'transfer', label: 'Migration Bridge', icon: ArrowLeftRight },
    { id: 'diagnostics', label: 'Hardware Inspection', icon: Activity },
    { id: 'history', label: 'Trade-in History', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <aside className="w-64 bg-[#061126] border-r border-[#132B5C] flex flex-col justify-between select-none pt-8 pb-4">
      {/* Top Header & Brand */}
      <div>
        {/* macOS traffic light spacer */}
        <div className="px-5 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0157FC] to-[#6B1DFD] p-0.5 shadow-lg shadow-[#0157FC]/20 flex items-center justify-center overflow-hidden">
              <img src="/app-icon.png" alt="Icon" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#F0F4FC] tracking-tight">WireShift</h1>
              <p className="text-[10px] text-[#00F0FF] font-medium tracking-wide">HIGH-SPEED SYNC</p>
            </div>
          </div>

          <button
            onClick={onRefresh}
            title="Scan for connected iPhones"
            disabled={isRefreshing}
            className={`p-1.5 rounded-lg text-[#96A9CC] hover:text-white hover:bg-[#071536] transition-all border border-transparent hover:border-[#132B5C] ${
              isRefreshing ? 'animate-spin text-[#00F0FF]' : ''
            }`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Live Device Status Pill */}
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between bg-[#030A1C] border border-[#132B5C] rounded-lg px-3 py-2 text-xs">
            <span className="text-[#96A9CC] flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${deviceCount > 0 ? 'bg-[#10B981] shadow-[0_0_8px_#10B981]' : 'bg-[#5A7199]'}`} />
              Connected Devices
            </span>
            <span className="font-mono font-bold text-[#F0F4FC]">{deviceCount}</span>
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#0F2A66] text-[#F0F4FC] font-semibold border-l-3 border-[#0157FC] shadow-sm'
                    : 'text-[#96A9CC] hover:text-white hover:bg-[#071536]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#00F0FF]' : 'text-[#8197BF]'}`} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom Info / About */}
      <div className="px-3 pt-3 border-t border-[#132B5C]/60">
        <button
          onClick={onOpenAbout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#96A9CC] hover:text-white hover:bg-[#071536] transition-colors"
        >
          <Info className="w-4 h-4 text-[#8197BF]" />
          <span>About WireShift</span>
          <span className="ml-auto text-[10px] font-mono text-[#5A7199]">v1.0.0</span>
        </button>
      </div>
    </aside>
  )
}
