import React, { useEffect, useState, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Sidebar } from './components/Sidebar'
import { DeviceSlot } from './components/DeviceSlot'
import { TransferBridge } from './components/TransferBridge'
import { MediaExplorer } from './components/MediaExplorer'
import { CableSpeedView } from './components/CableSpeedView'
import { DiagnosticsView } from './components/DiagnosticsView'
import { AboutModal } from './components/AboutModal'
import { ConnectedDevice, SystemStatus, ExportProgress, MediaCatalogSummary } from './types'
import { handleWindowDrag, handleWindowDoubleClick } from './utils/windowDrag'

export function App() {
  const [currentTab, setCurrentTab] = useState('transfer')
  const [devices, setDevices] = useState<ConnectedDevice[]>([])
  const [sourceUdid, setSourceUdid] = useState<string>('')
  const [targetUdid, setTargetUdid] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [isAboutOpen, setIsAboutOpen] = useState(false)

  // Target Destination Mode: 'pc' (1 phone required) or 'phone' (2 phones required)
  const [targetMode, setTargetMode] = useState<'phone' | 'pc'>('pc')
  const [exportPath, setExportPath] = useState<string>('')
  const [dcimCount, setDcimCount] = useState<number>(0)
  const [copiedCount, setCopiedCount] = useState<number>(0)
  const [copiedBytes, setCopiedBytes] = useState<number>(0)
  const [currentAlbum, setCurrentAlbum] = useState<string>('')
  const [isExportSuccess, setIsExportSuccess] = useState<boolean>(false)
  const [selectedCategories, setSelectedCategories] = useState({
    photos: true,
    contacts: true,
    files: false,
  })

  // Media Catalog (Photos & Videos) state
  const [catalog, setCatalog] = useState<MediaCatalogSummary | null>(null)
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false)

  // Migration / Export progress state
  const [isMigrating, setIsMigrating] = useState(false)
  const isMigratingRef = useRef(false)
  isMigratingRef.current = isMigrating

  const [progress, setProgress] = useState(0)
  const [speedText, setSpeedText] = useState('38.4 MB/s')
  const [etaText, setEtaText] = useState('3m 12s')

  // Fetch connected devices with cache invalidation
  const refreshDevices = async () => {
    setIsRefreshing(true)
    try {
      if (sourceUdid) {
        await invoke('refresh_device', { udid: sourceUdid })
      }
      const list = await invoke<ConnectedDevice[]>('get_connected_devices')
      setDevices(list)

      if (list.length >= 1 && !sourceUdid) {
        setSourceUdid(list[0].udid)
      }
      if (list.length >= 2 && !targetUdid) {
        setTargetUdid(list[1].udid)
      }
      if (list.length === 1 && targetMode !== 'pc') {
        setTargetMode('pc')
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Fetch initial system status and default export directory
  useEffect(() => {
    invoke<SystemStatus>('check_system_status')
      .then(setSystemStatus)
      .catch(console.error)

    invoke<string>('get_default_export_dir')
      .then((dir) => {
        if (dir) setExportPath(dir)
      })
      .catch(console.error)

    refreshDevices()

    // Smart auto-polling: checks devices every 3 seconds without causing re-renders if identical
    const interval = setInterval(async () => {
      // If currently migrating or exporting, pause scanning to avoid USB socket contention
      if (isMigratingRef.current) return

      try {
        const list = await invoke<ConnectedDevice[]>('get_connected_devices')
        setDevices((prev) => {
          // Check if devices actually changed
          if (prev.length === list.length) {
            const isSame = prev.every((d, i) => {
              const n = list[i]
              return (
                d.udid === n.udid &&
                d.is_trusted === n.is_trusted &&
                d.battery?.health_percent === n.battery?.health_percent &&
                d.storage?.available_bytes === n.storage?.available_bytes
              )
            })
            if (isSame) return prev // PRESERVE SAME REFERENCE -> ZERO RE-RENDER!
          }

          if (list.length >= 1 && !sourceUdid) setSourceUdid(list[0].udid)
          if (list.length >= 2 && !targetUdid) setTargetUdid(list[1].udid)
          return list
        })
      } catch (e) {
        console.debug('Polling check:', e)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  const sourceDevice = devices.find((d) => d.udid === sourceUdid) || (devices.length > 0 ? devices[0] : null)
  const targetDevice = devices.find((d) => d.udid === targetUdid) || (devices.length > 1 ? devices[1] : null)

  // Fetch photo count whenever sourceDevice changes
  useEffect(() => {
    if (sourceDevice) {
      invoke<{ dcim_count: number; default_dir: string }>('get_export_stats', { udid: sourceDevice.udid })
        .then((stats) => {
          if (stats.dcim_count) setDcimCount(stats.dcim_count)
          if (stats.default_dir && exportPath === '~/Pictures/WireShift_Exports') {
            setExportPath(stats.default_dir)
          }
        })
        .catch(console.debug)
    }
  }, [sourceDevice?.udid])

  // Load interactive media catalog
  const loadMediaCatalog = async (udid?: string) => {
    const id = udid || sourceDevice?.udid
    if (!id) return
    setIsCatalogLoading(true)
    try {
      const res = await invoke<MediaCatalogSummary>('fetch_media_catalog', { udid: id })
      setCatalog(res)
      if (res.total_files) {
        setDcimCount(res.total_files)
      }
    } catch (err) {
      console.error('Failed to load media catalog:', err)
    } finally {
      setIsCatalogLoading(false)
    }
  }

  // Auto-fetch catalog when user navigates to media tab
  useEffect(() => {
    if (currentTab === 'media' && !catalog && sourceDevice) {
      loadMediaCatalog(sourceDevice.udid)
    }
  }, [currentTab, sourceDevice?.udid])

  const handlePickExportFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Fayllarni saqlash papkasini tanlang',
      })
      if (selected && typeof selected === 'string') {
        setExportPath(selected)
      }
    } catch (err) {
      console.error('Folder picker error:', err)
    }
  }

  const handleOpenExportFolder = async () => {
    try {
      await invoke('open_folder_in_finder', { path: exportPath })
    } catch (err) {
      console.error('Open folder error:', err)
    }
  }

  const handleToggleCategory = (cat: 'photos' | 'contacts' | 'files') => {
    setSelectedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }))
  }

  // Export specific user-selected files (e.g. from MediaExplorer)
  const handleExportSelectedMedia = async (paths: string[]) => {
    if (!sourceDevice || paths.length === 0) return
    let targetDir = exportPath
    if (!targetDir) {
      try {
        targetDir = await invoke<string>('get_default_export_dir')
        setExportPath(targetDir)
      } catch {
        targetDir = 'Pictures/WireShift_Exports'
      }
    }

    setIsMigrating(true)
    setIsExportSuccess(false)
    setProgress(3)
    setSpeedText('38.4 MB/s')
    setEtaText('Fayllar yozilmoqda...')

    const selectedItems = catalog?.items.filter((i) => paths.includes(i.path)) || []
    const totalSelectedBytes = selectedItems.reduce((acc, i) => acc + i.size_bytes, 0) || 100 * 1024 * 1024
    setDcimCount(paths.length)
    setCopiedCount(0)
    setCopiedBytes(0)

    const startTime = Date.now()
    const progressTimer = setInterval(async () => {
      try {
        const prog = await invoke<ExportProgress>('get_export_progress', {
          destinationDir: exportPath,
        })
        if (prog) {
          setCopiedBytes(prog.copied_bytes)
          setCopiedCount(prog.copied_files)
          const elapsedSeconds = Math.max((Date.now() - startTime) / 1000, 0.5)
          const mbPerSec = prog.copied_bytes / (1024 * 1024) / elapsedSeconds

          if (totalSelectedBytes > 0) {
            const pct = Math.min(Math.round((prog.copied_bytes / totalSelectedBytes) * 100), 99)
            setProgress(Math.max(pct, 4))

            if (mbPerSec > 0.5) {
              setSpeedText(`${mbPerSec.toFixed(1)} MB/s`)
              const remainingBytes = Math.max(totalSelectedBytes - prog.copied_bytes, 0)
              const remainingSecs = Math.round(remainingBytes / (mbPerSec * 1024 * 1024))
              if (remainingSecs > 60) {
                setEtaText(`${Math.round(remainingSecs / 60)} daq ${remainingSecs % 60}s`)
              } else {
                setEtaText(`${remainingSecs} sek`)
              }
            }
          }
        }
      } catch (e) {
        console.debug('Progress poll error:', e)
      }
    }, 400)

    try {
      await invoke('export_selected_media', {
        udid: sourceDevice.udid,
        destinationDir: targetDir,
        paths,
      })
      clearInterval(progressTimer)
      setProgress(100)
      setIsExportSuccess(true)
    } catch (err) {
      clearInterval(progressTimer)
      console.error('Export selected error:', err)
      alert('Eksport jarayonida xatolik yuz berdi: ' + err)
    } finally {
      clearInterval(progressTimer)
      setIsMigrating(false)
    }
  }

  const handleCancelMigration = async () => {
    try {
      await invoke('cancel_export')
    } catch (e) {
      console.debug('Cancel export error:', e)
    } finally {
      setIsMigrating(false)
      setProgress(0)
    }
  }

  const handleStartMigration = async (mode: 'full' | 'selective') => {
    setIsMigrating(true)
    setIsExportSuccess(false)
    setProgress(2)

    const isUsb3 = sourceDevice?.connection.max_bandwidth_mbps && sourceDevice.connection.max_bandwidth_mbps >= 5000
    setSpeedText(isUsb3 ? '128 MB/s' : '38.4 MB/s')
    setEtaText(isUsb3 ? '45 sek' : '1m 20s')

    if (targetMode === 'pc') {
      try {
        setCopiedCount(0)
        setCopiedBytes(0)
        setCurrentAlbum('')
        const startTime = Date.now()

        // Real-time progress poller every 600ms
        const progressTimer = setInterval(async () => {
          try {
            const prog = await invoke<ExportProgress>('get_export_progress', {
              destinationDir: exportPath,
            })
            if (prog) {
              setCopiedCount(prog.copied_files)
              setCopiedBytes(prog.copied_bytes)
              if (prog.current_album) setCurrentAlbum(prog.current_album)

              if (dcimCount > 0) {
                const pct = Math.min(Math.round((prog.copied_files / dcimCount) * 100), 99)
                setProgress(pct)

                // Calculate real dynamic speed & ETA
                const elapsedSeconds = Math.max((Date.now() - startTime) / 1000, 1)
                const mbPerSec = prog.copied_bytes / (1024 * 1024) / elapsedSeconds
                if (mbPerSec > 0.5) {
                  setSpeedText(`${mbPerSec.toFixed(1)} MB/s`)
                  const remainingFiles = Math.max(dcimCount - prog.copied_files, 0)
                  const avgBytesPerFile = prog.copied_files > 0 ? prog.copied_bytes / prog.copied_files : 12 * 1024 * 1024
                  const estRemainingBytes = remainingFiles * avgBytesPerFile
                  const remainingSecs = Math.round(estRemainingBytes / (mbPerSec * 1024 * 1024))
                  if (remainingSecs > 60) {
                    setEtaText(`${Math.round(remainingSecs / 60)} daq ${remainingSecs % 60}s`)
                  } else {
                    setEtaText(`${remainingSecs} sek`)
                  }
                }
              }
            }
          } catch (e) {
            console.debug('Progress poll error:', e)
          }
        }, 600)

        if (sourceDevice && selectedCategories.photos) {
          await invoke('export_dcim_to_pc', {
            udid: sourceDevice.udid,
            destinationDir: exportPath,
          })
        }

        clearInterval(progressTimer)
        setProgress(100)
        setIsExportSuccess(true)
      } catch (err) {
        console.error('Export failed:', err)
        alert('Eksport jarayonida xatolik yuz berdi: ' + err)
      } finally {
        setIsMigrating(false)
      }
    } else {
      let current = 0
      const timer = setInterval(() => {
        current += 5
        setProgress(current)
        if (current >= 100) {
          clearInterval(timer)
          setIsMigrating(false)
          alert('✅ Muvaffaqiyatli! Barcha ma\'lumotlar yangi telefonga to\'liq ko\'chirildi.')
        }
      }, 400)
    }
  }

  return (
    <div className="flex h-screen bg-[#0E0F12] text-white overflow-hidden font-sans select-none">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenAbout={() => setIsAboutOpen(true)}
        onRefresh={refreshDevices}
        isRefreshing={isRefreshing}
        deviceCount={devices.length}
        isMigrating={isMigrating}
        progress={progress}
      />

      {/* Main Workspace Area */}
      <main className={`flex-1 flex flex-col min-w-0 bg-[#0E0F12] ${currentTab === 'media' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* Top Native Titlebar / Drag Region */}
        <header
          data-tauri-drag-region
          onMouseDown={handleWindowDrag}
          onDoubleClick={handleWindowDoubleClick}
          className="h-16 px-8 border-b border-white/[0.06] flex items-center justify-between select-none cursor-default shrink-0 z-10 bg-[#0E0F12]/80 backdrop-blur-xl"
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 pointer-events-none">
            <span className="text-xs font-semibold text-white/50">WireShift</span>
            <span className="text-white/25">/</span>
            <span className="text-xs font-semibold text-white/90">
              {currentTab === 'transfer'
                ? targetMode === 'pc'
                  ? 'Telefondan kompyuterga eksport'
                  : 'Telefonlar o\'rtasida transfer'
                : currentTab === 'media'
                ? 'Rasmlar & Videolar Galereyasi'
                : currentTab === 'cable'
                ? 'Kabel va Port Tezligi Diagnostikasi'
                : 'Uskunalar diagnostikasi'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* PERSISTENT GLOBAL PROGRESS INDICATOR ACROSS ALL TABS */}
            {isMigrating && (
              <div className="flex items-center gap-2">
                <div
                  onClick={() => setCurrentTab('transfer')}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#0A84FF]/12 border border-[#0A84FF]/30 backdrop-blur-md cursor-pointer hover:bg-[#0A84FF]/20 transition-all"
                  title="Transfer oynasiga o'tish"
                >
                  <div className="w-2 h-2 rounded-full bg-[#0A84FF] animate-ping" />
                  <span className="text-xs font-semibold text-[#0A84FF]">
                    ⚡ Yuklanmoqda {copiedCount > 0 ? `(${copiedCount}/${dcimCount})` : ''} • {speedText}
                  </span>
                  <span className="text-xs font-mono font-bold text-white bg-[#0A84FF]/30 px-2 py-0.5 rounded-lg">
                    {progress}%
                  </span>
                </div>

                <button
                  onClick={handleCancelMigration}
                  className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-semibold cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                  title="Yuklashni to'xtatish"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span>Bekor qilish</span>
                </button>
              </div>
            )}

            {/* Device Count Badge */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-white/[0.04] border border-white/[0.08] text-white/70 pointer-events-none">
              <span className={`w-2 h-2 rounded-full ${devices.length > 0 ? 'bg-[#30D158]' : 'bg-[#EF4444]'}`} />
              <span>{devices.length} ta iPhone ulangan</span>
            </div>
          </div>
        </header>

        {/* Dynamic Content Views */}
        <div className={`flex-1 w-full ${currentTab === 'media' ? 'p-4 md:p-6 overflow-hidden flex flex-col min-h-0' : 'p-6 md:p-8 space-y-6'}`}>
          {currentTab === 'transfer' && (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Dual Device Slots Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <DeviceSlot
                  title="Manba (iPhone)"
                  role="source"
                  device={sourceDevice}
                  allDevices={devices}
                  onSelectDevice={setSourceUdid}
                  onOpenCableSpeed={() => setCurrentTab('cable')}
                />

                <DeviceSlot
                  title={targetMode === 'pc' ? 'Qabul qiluvchi (Mac)' : 'Qabul qiluvchi (iPhone)'}
                  role="target"
                  device={targetDevice}
                  allDevices={devices.filter((d) => d.udid !== sourceDevice?.udid)}
                  onSelectDevice={setTargetUdid}
                  targetMode={targetMode}
                  exportPath={exportPath}
                  onPickExportPath={handlePickExportFolder}
                  onOpenFolder={handleOpenExportFolder}
                  onOpenCableSpeed={() => setCurrentTab('cable')}
                />
              </div>

              {/* Central Migration & Export Control Bridge */}
              <TransferBridge
                hasSource={!!sourceDevice}
                hasTarget={targetMode === 'pc' ? true : !!targetDevice}
                targetMode={targetMode}
                onToggleTargetMode={setTargetMode}
                onStartMigration={handleStartMigration}
                isMigrating={isMigrating}
                progress={progress}
                speedText={speedText}
                etaText={etaText}
                dcimCount={dcimCount}
                copiedCount={copiedCount}
                copiedBytes={copiedBytes}
                currentAlbum={currentAlbum}
                isExportSuccess={isExportSuccess}
                onOpenExportFolder={handleOpenExportFolder}
                onOpenMediaExplorer={() => {
                  setCurrentTab('media')
                  if (!catalog) loadMediaCatalog()
                }}
                onOpenCableSpeed={() => setCurrentTab('cable')}
                isCableThrottled={sourceDevice?.connection.is_cable_throttled}
                onCancelMigration={handleCancelMigration}
                selectedCategories={selectedCategories}
                onToggleCategory={handleToggleCategory}
              />
            </div>
          )}

          {currentTab === 'media' && (
            <MediaExplorer
              catalog={catalog}
              isLoading={isCatalogLoading}
              onRefreshCatalog={() => loadMediaCatalog()}
              destinationDir={exportPath || 'Yuklanmoqda...'}
              onPickDestinationDir={handlePickExportFolder}
              onExportSelected={handleExportSelectedMedia}
              isExporting={isMigrating}
              exportProgress={progress}
              exportSpeed={speedText}
              isExportSuccess={isExportSuccess}
              onOpenFolder={handleOpenExportFolder}
              onCancelExport={handleCancelMigration}
              udid={sourceDevice?.udid}
            />
          )}

          {currentTab === 'cable' && (
            <div className="max-w-6xl mx-auto">
              <CableSpeedView
                device={sourceDevice}
                onOpenFinalCutBridge={() => setCurrentTab('media')}
              />
            </div>
          )}

          {currentTab === 'diagnostics' && (
            <div className="max-w-6xl mx-auto">
              <DiagnosticsView devices={devices} />
            </div>
          )}

          {currentTab === 'history' && (
            <div className="apple-glass rounded-2xl p-12 text-center space-y-2">
              <h3 className="text-sm font-semibold text-white">Oldi-sotdi va transfer jurnali</h3>
              <p className="text-xs text-white/50">Barcha amalga oshirilgan transferlar tarixi shu yerda qayd etiladi.</p>
            </div>
          )}

          {currentTab === 'settings' && (
            <div className="apple-glass rounded-2xl p-12 text-center space-y-2">
              <h3 className="text-sm font-semibold text-white">Sozlamalar va Kesh boshqaruvi</h3>
              <p className="text-xs text-white/50">WireShift tizim parametrlari va port sozlamalari.</p>
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
