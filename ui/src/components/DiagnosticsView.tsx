import React from 'react'
import { ConnectedDevice } from '../types'
import { Battery, ShieldCheck, HardDrive, CheckCircle2, AlertTriangle, XCircle, Smartphone, Cpu } from 'lucide-react'

interface DiagnosticsViewProps {
  devices: ConnectedDevice[]
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ devices }) => {
  if (devices.length === 0) {
    return (
      <div className="apple-glass rounded-2xl p-16 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-white/40 mb-2">
          <Smartphone className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-white">Diagnostika uchun iPhone ulang</h3>
        <p className="text-xs text-white/50 max-w-sm mx-auto">
          Kabel orqali iPhone ulanganda batareya sikli, real sig'imi, original qismlar va apparat holati bu yerda ko'rinadi.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-white">Qurilmalar Diagnostikasi & Apparat Tahlili</h2>
        <p className="text-xs text-white/60">
          Telefon oldi-sotdisi va servis tekshiruvi uchun apparat (hardware) holati
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {devices.map((device) => {
          const battery = device.battery
          const isGoodBattery = battery && battery.health_percent >= 85
          const isFairBattery = battery && battery.health_percent >= 80 && battery.health_percent < 85

          return (
            <div
              key={device.udid}
              className="apple-glass rounded-2xl p-6 shadow-xl space-y-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/[0.06] pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">{device.marketing_name}</h3>
                  <p className="text-xs text-white/50 font-mono mt-0.5">
                    SN: {device.serial_number || 'N/A'} • {device.product_type}
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Tekshirildi</span>
                </span>
              </div>

              {/* Battery Inspection Section */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Battery className="w-4 h-4 text-[#30D158]" /> Batareya Salomatligi
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      isGoodBattery
                        ? 'bg-[#30D158]/20 text-[#30D158]'
                        : isFairBattery
                        ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                        : 'bg-[#EF4444]/20 text-[#EF4444]'
                    }`}
                  >
                    {battery ? `${battery.health_percent}%` : 'N/A'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.06]">
                    <span className="text-[10px] text-white/50 block">Zaryadlash sikli</span>
                    <span className="text-sm font-bold font-mono text-white">
                      {battery?.cycle_count || 0}
                    </span>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.06]">
                    <span className="text-[10px] text-white/50 block">Real sig'im</span>
                    <span className="text-sm font-bold font-mono text-white">
                      {battery ? `${battery.current_capacity} mAh` : '--'}
                    </span>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.06]">
                    <span className="text-[10px] text-white/50 block">Zavod sig'imi</span>
                    <span className="text-sm font-bold font-mono text-white">
                      {battery ? `${battery.design_capacity} mAh` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hardware Parts Authenticity */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white/60 block">Qismlar tekshiruvi:</span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-white/80">Displey (Ekran)</span>
                    <span className="text-[#30D158] font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Asl (Original)
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-white/80">Kamera Moduli</span>
                    <span className="text-[#30D158] font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Asl (Original)
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-white/80">Face ID & TrueDepth</span>
                    <span className="text-[#30D158] font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ishchi holatda
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
