import React from 'react'
import { Smartphone, BatteryCharging, HardDrive, ShieldAlert, Zap, Copy, Check } from 'lucide-react'
import { ConnectedDevice } from '../types'

interface DeviceSlotProps {
  title: string
  role: 'source' | 'target'
  device: ConnectedDevice | null
  allDevices: ConnectedDevice[]
  onSelectDevice: (udid: string) => void
}

export const DeviceSlot: React.FC<DeviceSlotProps> = ({
  title,
  role,
  device,
  allDevices,
  onSelectDevice,
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
  const accentColor = isSource ? '#0157FC' : '#6B1DFD'

  return (
    <div className={`relative flex flex-col rounded-2xl bg-[#071536] border p-5 transition-all shadow-xl ${
      device ? 'border-[#1E438A]' : 'border-[#132B5C] border-dashed'
    }`}>
      {/* Header Tag */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase border"
            style={{
              backgroundColor: isSource ? 'rgba(1, 87, 252, 0.15)' : 'rgba(107, 29, 253, 0.15)',
              borderColor: isSource ? 'rgba(1, 87, 252, 0.4)' : 'rgba(107, 29, 253, 0.4)',
              color: isSource ? '#00F0FF' : '#E0D8FA',
            }}
          >
            {isSource ? '📱 Manba (Eski Telefon)' : '📱 Qabul qiluvchi (Yangi Telefon)'}
          </span>
          <span className="text-xs font-semibold text-[#F0F4FC]">{title}</span>
        </div>

        {allDevices.length > 1 && (
          <select
            value={device?.udid || ''}
            onChange={(e) => onSelectDevice(e.target.value)}
            className="bg-[#030A1C] border border-[#132B5C] rounded-lg text-xs text-[#F0F4FC] px-2 py-1 outline-none"
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

      {device ? (
        <div className="flex-1 flex flex-col justify-between space-y-4">
          {/* Device Core Info */}
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center p-2.5 shadow-lg shrink-0 border"
              style={{
                backgroundColor: 'rgba(3, 10, 28, 0.8)',
                borderColor: accentColor,
              }}
            >
              <Smartphone className="w-8 h-8 text-[#F0F4FC]" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-[#F0F4FC] truncate">{device.marketing_name}</h3>
              <p className="text-xs text-[#96A9CC] flex items-center gap-1.5 mt-0.5">
                <span>iOS {device.ios_version || 'Nomaʼlum'}</span>
                <span>•</span>
                <span className="font-mono">{device.product_type}</span>
              </p>

              {/* Serial number with copy */}
              {device.serial_number && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[11px] font-mono text-[#5A7199]">SN: {device.serial_number}</span>
                  <button
                    onClick={() => handleCopySerial(device.serial_number)}
                    className="p-0.5 text-[#5A7199] hover:text-[#00F0FF] transition-colors"
                    title="Nusxalash"
                  >
                    {copied ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>

            {/* Connection speed badge */}
            <div className="text-right">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                device.connection.max_bandwidth_mbps >= 5000
                  ? 'bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/30'
                  : 'bg-[#0B2050] text-[#96A9CC] border-[#132B5C]'
              }`}>
                <Zap className="w-3 h-3" />
                {device.connection.bus_type}
              </span>
            </div>
          </div>

          {/* Trust Alert */}
          {!device.is_trusted && (
            <div className="bg-[#332005] border border-[#F59E0B]/50 rounded-xl p-3 flex items-center gap-2.5 text-xs text-[#F59E0B]">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Telefon ekranini oching va <strong>"Ishonish" (Trust This Computer)</strong> tugmasini bosing!
              </span>
            </div>
          )}

          {/* Quick Metrics (Battery & Storage) */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Battery Card */}
            <div className="bg-[#030A1C] border border-[#132B5C] rounded-xl p-3">
              <div className="flex items-center justify-between text-xs text-[#96A9CC] mb-1">
                <span className="flex items-center gap-1">
                  <BatteryCharging className="w-3.5 h-3.5 text-[#10B981]" /> Batareya
                </span>
                <span className="font-mono text-[10px] text-[#5A7199]">
                  {device.battery ? `${device.battery.cycle_count} sikl` : '--'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-mono text-[#F0F4FC]">
                  {device.battery ? `${device.battery.health_percent}%` : 'N/A'}
                </span>
                <span className="text-[10px] text-[#10B981] font-medium">
                  {device.battery && device.battery.health_percent >= 85 ? 'Yaxshi' : 'Servis'}
                </span>
              </div>
            </div>

            {/* Storage Card */}
            <div className="bg-[#030A1C] border border-[#132B5C] rounded-xl p-3">
              <div className="flex items-center justify-between text-xs text-[#96A9CC] mb-1">
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5 text-[#00F0FF]" /> Xotira
                </span>
                <span className="font-mono text-[10px] text-[#5A7199]">
                  {device.storage ? `${formatBytes(device.storage.used_bytes)} band` : '--'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-mono text-[#F0F4FC]">
                  {device.storage ? formatBytes(device.storage.total_bytes) : 'N/A'}
                </span>
                <span className="text-[10px] text-[#96A9CC]">
                  {device.storage ? `${formatBytes(device.storage.available_bytes)} bo'sh` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty Slot State */
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-[#030A1C] border border-[#132B5C] flex items-center justify-center mb-3">
            <Smartphone className="w-7 h-7 text-[#5A7199] animate-pulse" />
          </div>
          <p className="text-sm font-semibold text-[#F0F4FC] mb-1">Telefon ulanmagan</p>
          <p className="text-xs text-[#96A9CC] max-w-xs leading-relaxed">
            iPhone'ni USB-C yoki Lightning kabel orqali kompyuterga ulang.
          </p>
        </div>
      )}
    </div>
  )
}
