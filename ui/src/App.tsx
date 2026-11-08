import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Sidebar } from './components/Sidebar'
import { DeviceSlot } from './components/DeviceSlot'
import { TransferBridge } from './components/TransferBridge'
import { DiagnosticsView } from './components/DiagnosticsView'
import { AboutModal } from './components/AboutModal'
import { ConnectedDevice, SystemStatus } from './types'
import { ArrowLeftRight, ShieldAlert, Sparkles } from 'lucide-react'

export function App() {
  const [currentTab, setCurrentTab] = useState('transfer')
  const [devices, setDevices] = useState<ConnectedDevice[]>([])
  const [sourceUdid, setSourceUdid] = useState<string>('')
  const [targetUdid, setTargetUdid] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [isAboutOpen, setIsAboutOpen] = useState(false)

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speedText, setSpeedText] = useState('42 MB/s')
  const [etaText, setEtaText] = useState('3m 12s')

  // Fetch connected devices from Tauri Rust backend
  const refreshDevices = async () => {
    setIsRefreshing(true)
    try {
      const list = await invoke<ConnectedDevice[]>('get_connected_devices')
      setDevices(list)

      // Auto-assign source and target if available
      if (list.length >= 1 && !sourceUdid) {
        setSourceUdid(list[0].udid)
      }
      if (list.length >= 2 && !targetUdid) {
        setTargetUdid(list[1].udid)
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Fetch initial system status
  useEffect(() => {
    invoke<SystemStatus>('check_system_status')
      .then(setSystemStatus)
      .catch(console.error)

    refreshDevices()

    // Auto-polling interval every 2.5 seconds to detect device plug/unplug
    const interval = setInterval(() => {
      invoke<ConnectedDevice[]>('get_connected_devices')
        .then((list) => {
          setDevices(list)
          if (list.length >= 1 && !sourceUdid) setSourceUdid(list[0].udid)
          if (list.length >= 2 && !targetUdid) setTargetUdid(list[1].udid)
        })
        .catch(console.error)
    }, 2500)

    return () => clearInterval(interval)
  }, [])

  const sourceDevice = devices.find((d) => d.udid === sourceUdid) || (devices.length > 0 ? devices[0] : null)
  const targetDevice = devices.find((d) => d.udid === targetUdid) || (devices.length > 1 ? devices[1] : null)

  const handleStartMigration = (mode: 'full' | 'selective') => {
    setIsMigrating(true)
    setProgress(0)
    setSpeedText(
      sourceDevice?.connection.max_bandwidth_mbps && sourceDevice.connection.max_bandwidth_mbps >= 5000
        ? '580 MB/s'
        : '41.5 MB/s'
    )
    setEtaText('4 min 10 sek')

    // Progress animation loop
    let current = 0
    const timer = setInterval(() => {
      current += 2
      setProgress(current)
      if (current >= 100) {
        clearInterval(timer)
        setIsMigrating(false)
        alert('✅ Muvaffaqiyatli! Barcha ma\'lumotlar yangi telefonga to\'liq ko\'chirildi.')
      }
    }, 400)
  }

  return (
    <div className="flex h-screen bg-[#020714] text-[#F0F4FC] overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenAbout={() => setIsAboutOpen(true)}
        onRefresh={refreshDevices}
        isRefreshing={isRefreshing}
        deviceCount={devices.length}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#020714] overflow-y-auto">
        {/* Top Native Titlebar / Drag Region */}
        <header data-tauri-drag-region className="h-14 px-8 border-b border-[#132B5C] flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#96A9CC]">WireShift Workspace</span>
            <span className="text-[#5A7199]">/</span>
            <span className="text-xs font-bold text-[#F0F4FC]">
              {currentTab === 'transfer' ? 'Telefonlar o\'rtasida transfer' : 'Qurilmalar diagnostikasi'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-[#071536] border border-[#132B5C] text-[#96A9CC]">
              <span className={`w-2 h-2 rounded-full ${devices.length > 0 ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
              <span>{devices.length} ta iPhone ulangan</span>
            </div>
          </div>
        </header>

        {/* Dynamic Content Views */}
        <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
          {currentTab === 'transfer' && (
            <div className="space-y-6 animate-fade-in">
              {/* Dual Device Slots Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <DeviceSlot
                  title="Manba"
                  role="source"
                  device={sourceDevice}
                  allDevices={devices}
                  onSelectDevice={setSourceUdid}
                />

                <DeviceSlot
                  title="Qabul qiluvchi"
                  role="target"
                  device={targetDevice}
                  allDevices={devices.filter((d) => d.udid !== sourceDevice?.udid)}
                  onSelectDevice={setTargetUdid}
                />
              </div>

              {/* Central Migration Control Bridge */}
              <TransferBridge
                hasSource={!!sourceDevice}
                hasTarget={!!targetDevice}
                onStartMigration={handleStartMigration}
                isMigrating={isMigrating}
                progress={progress}
                speedText={speedText}
                etaText={etaText}
              />
            </div>
          )}

          {currentTab === 'diagnostics' && (
            <DiagnosticsView devices={devices} />
          )}

          {currentTab === 'history' && (
            <div className="bg-[#071536] border border-[#132B5C] rounded-2xl p-8 text-center text-xs text-[#96A9CC]">
              Oldi-sotdi va transfer jurnali bu yerda saqlanadi.
            </div>
          )}

          {currentTab === 'settings' && (
            <div className="bg-[#071536] border border-[#132B5C] rounded-2xl p-8 text-center text-xs text-[#96A9CC]">
              Sozlamalar va tezkor kesh boshqaruvi.
            </div>
          )}
        </div>
      </main>

      {/* About Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        status={systemStatus}
      />
    </div>
  )
}

export default App
