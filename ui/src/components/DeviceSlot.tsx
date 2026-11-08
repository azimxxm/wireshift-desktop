import React from 'react'
import {
  Smartphone,
  BatteryCharging,
  HardDrive,
  ShieldAlert,
  Zap,
  Copy,
  Check,
  Laptop,
  FolderOpen,
  AlertTriangle
} from 'lucide-react'
import { ConnectedDevice } from '../types'

interface DeviceSlotProps {
  title: string
  role: 'source' | 'target'
  device: ConnectedDevice | null
  allDevices: ConnectedDevice[]
  onSelectDevice: (udid: string) => void
  targetMode?: 'phone' | 'pc'
  exportPath?: string
  onPickExportPath?: () => void
  onOpenFolder?: () => void
  onOpenCableSpeed?: () => void
}

export const DeviceSlot: React.FC<DeviceSlotProps> = ({
  title,
  role,
  device,
  allDevices,
  onSelectDevice,
  targetMode = 'phone',
  exportPath = '~/Pictures/WireShift_Exports',
  onPickExportPath,
  onOpenFolder,
  onOpenCableSpeed,
}) => {
  const [copied, setCopied] = React.useState(false)

  const handleCopySerial = (serial: string) => {
    navigator.clipboard.writeText(serial)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 GB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }

  const isSource = role === 'source'

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-6 transition-all shadow-xl ${
        device || (!isSource && targetMode === 'pc')
          ? 'apple-glass'
          : 'bg-white/[0.02] border border-white/[0.08] border-dashed'
      }`}
    >
      {/* Header Tag */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border ${
              isSource
                ? 'bg-[#0A84FF]/12 border-[#0A84FF]/30 text-[#0A84FF]'
                : targetMode === 'pc'
                ? 'bg-[#30D158]/12 border-[#30D158]/30 text-[#30D158]'
                : 'bg-white/[0.08] border-white/[0.15] text-white/90'
            }`}
          >
            {isSource
              ? '📱 Manba (Eski Telefon)'
              : targetMode === 'pc'
              ? '💻 Qabul qiluvchi (Mac)'
              : '📱 Qabul qiluvchi (Yangi Telefon)'}
          </span>
          <span className="text-xs font-semibold text-white/80">{title}</span>
        </div>

        {allDevices.length > 1 && isSource && (
          <select
            value={device?.udid || ''}
            onChange={(e) => onSelectDevice(e.target.value)}
            className="bg-black/40 border border-white/[0.1] rounded-lg text-xs text-white px-2.5 py-1 outline-none"
          >
            <option value="">Telefonni tanlang</option>
            {allDevices.map((d) => (
              <option key={d.udid} value={d.udid}>
                {d.marketing_name} ({d.serial_number || d.udid.slice(0, 8)})
              </option>
            ))}
          </select>
        )}
      </div>

      {!isSource && targetMode === 'pc' ? (
        /* PC Target View */
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center p-2.5 shadow-lg shrink-0 border border-white/[0.1] bg-white/[0.04]">
              <Laptop className="w-8 h-8 text-[#0A84FF]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white truncate">Ushbu Kompyuter (Mac)</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#30D158]/15 text-[#30D158] font-semibold border border-[#30D158]/30 shrink-0">
                  1 ta telefon yetarli
                </span>
              </div>
              <p className="text-xs text-white/60 mt-1 truncate">
                Saqlash joyi: <span className="font-mono text-white/90">{exportPath}</span>
              </p>
              <div className="flex items-center gap-3 mt-2">
                {onPickExportPath && (
                  <button
                    onClick={onPickExportPath}
                    className="text-[11px] text-[#0A84FF] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Papkani o'zgartirish...
                  </button>
                )}
                {onOpenFolder && (
                  <button
                    onClick={onOpenFolder}
                    className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 font-medium cursor-pointer"
                  >
                    Finder'da ko'rish ↗
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
              <span className="text-[11px] text-white/50 block mb-1">Eksport formati</span>
              <span className="text-xs font-semibold text-white">Asl Sifat (Original HEIC/4K)</span>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
              <span className="text-[11px] text-white/50 block mb-1">Kabel o'tkazuvchanligi</span>
              <span className="text-xs font-semibold text-[#0A84FF]">Thunderbolt 4 / Direct</span>
            </div>
          </div>
        </div>
      ) : device ? (
        <div className="flex-1 flex flex-col justify-between space-y-4">
          {/* Device Core Info */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center p-2.5 shadow-lg shrink-0 border border-white/[0.1] bg-white/[0.04]">
              <Smartphone className="w-8 h-8 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white truncate">{device.marketing_name}</h3>
              <p className="text-xs text-white/60 flex items-center gap-1.5 mt-0.5">
                <span>iOS {device.ios_version || 'Nomaʼlum'}</span>
                <span>•</span>
                <span className="font-mono">{device.product_type}</span>
              </p>

              {/* Serial number with copy */}
              {device.serial_number && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[11px] font-mono text-white/40">SN: {device.serial_number}</span>
                  <button
                    onClick={() => handleCopySerial(device.serial_number)}
                    className="p-0.5 text-white/40 hover:text-white transition-colors"
                    title="Nusxalash"
                  >
                    {copied ? <Check className="w-3 h-3 text-[#30D158]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>

            {/* Connection speed badge */}
            <div className="text-right">
              <button
                onClick={onOpenCableSpeed}
                title="Kabel tezligini tekshirish"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold border transition-all cursor-pointer ${
                  device.connection.is_cable_throttled
                    ? 'bg-[#F59E0B]/12 text-[#F59E0B] border-[#F59E0B]/30 hover:bg-[#F59E0B]/20'
                    : 'bg-[#30D158]/12 text-[#30D158] border-[#30D158]/30 hover:bg-[#30D158]/20'
                }`}
              >
                {device.connection.is_cable_throttled ? (
                  <AlertTriangle className="w-3 h-3 text-[#F59E0B]" />
                ) : (
                  <Zap className="w-3 h-3 text-[#30D158]" />
                )}
                <span>{device.connection.bus_type}</span>
              </button>
              {device.connection.is_cable_throttled && (
                <span className="block text-[9px] text-[#F59E0B]/80 mt-0.5 font-sans">
                  ⚠️ Kabel cheklovi
                </span>
              )}
            </div>
          </div>

          {/* Trust Alert */}
          {!device.is_trusted && (
            <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-[#F59E0B]">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Telefon ekranini oching va <strong>"Ishonish" (Trust This Computer)</strong> tugmasini bosing!
              </span>
            </div>
          )}

          {/* Quick Metrics (Battery & Storage) */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Battery Card */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                <span className="flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-[#30D158]" /> Batareya
                </span>
                <span className="font-mono text-[10px] text-white/40">
                  {device.battery ? `${device.battery.cycle_count} sikl` : '--'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-mono text-white">
                  {device.battery ? `${device.battery.health_percent}%` : 'N/A'}
                </span>
                <span className="text-[10px] text-[#30D158] font-medium">
                  {device.battery && device.battery.health_percent >= 85 ? 'Yaxshi' : 'Servis'}
                </span>
              </div>
            </div>

            {/* Storage Card */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[#0A84FF]" /> Xotira
                </span>
                <span className="font-mono text-[10px] text-white/40">
                  {device.storage ? `${formatBytes(device.storage.used_bytes)} band` : '--'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-mono text-white">
                  {device.storage ? formatBytes(device.storage.total_bytes) : 'N/A'}
                </span>
                <span className="text-[10px] text-white/50">
                  {device.storage ? `${formatBytes(device.storage.available_bytes)} bo'sh` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty Slot State */
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-3">
            <Smartphone className="w-7 h-7 text-white/40 animate-pulse" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Telefon ulanmagan</p>
          <p className="text-xs text-white/50 max-w-xs leading-relaxed">
            iPhone'ni USB-C yoki Lightning kabel orqali kompyuterga ulang.
          </p>
        </div>
      )}
    </div>
  )
}
