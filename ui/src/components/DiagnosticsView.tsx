import React from 'react'
import { ConnectedDevice } from '../types'
import { Battery, ShieldCheck, HardDrive, CheckCircle2, AlertTriangle, XCircle, Smartphone, Cpu } from 'lucide-react'

interface DiagnosticsViewProps {
  devices: ConnectedDevice[]
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ devices }) => {
  if (devices.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-[#071536] border border-[#132B5C] flex items-center justify-center mb-4">
          <Smartphone className="w-8 h-8 text-[#5A7199]" />
        </div>
        <h3 className="text-base font-bold text-[#F0F4FC] mb-1">Diagnostika uchun iPhone ulang</h3>
        <p className="text-xs text-[#96A9CC] max-w-sm">
          Kabel orqali iPhone ulanganda batareya sikli, real sig'imi, original qismlar va iCloud holati bu yerda ko'rinadi.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#F0F4FC]">Qurilmalar Diagnostikasi & Holat Nazorati</h2>
        <p className="text-xs text-[#96A9CC]">
          Telefon oldi-sotdisi va servis tekshiruvi uchun apparat (hardware) tahlili
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
              className="bg-[#071536] border border-[#1E438A] rounded-2xl p-5 shadow-xl space-y-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-[#132B5C] pb-4">
                <div>
                  <h3 className="text-base font-bold text-[#F0F4FC]">{device.marketing_name}</h3>
                  <p className="text-xs text-[#96A9CC] font-mono mt-0.5">
                    SN: {device.serial_number || 'N/A'} • {device.product_type}
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Tekshirildi</span>
                </span>
              </div>

              {/* Battery Inspection Section */}
              <div className="bg-[#030A1C] border border-[#132B5C] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F0F4FC] flex items-center gap-2">
                    <Battery className="w-4 h-4 text-[#10B981]" /> Batareya Salomatligi
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    isGoodBattery
                      ? 'bg-[#10B981]/20 text-[#10B981]'
                      : isFairBattery
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                      : 'bg-[#EF4444]/20 text-[#EF4444]'
                  }`}>
                    {battery ? `${battery.health_percent}%` : 'N/A'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="bg-[#071536] rounded-lg p-2 border border-[#132B5C]">
                    <span className="text-[10px] text-[#96A9CC] block">Quvvatlash sikli</span>
                    <span className="text-sm font-bold font-mono text-[#F0F4FC]">
                      {battery?.cycle_count || 0}
                    </span>
                  </div>
                  <div className="bg-[#071536] rounded-lg p-2 border border-[#132B5C]">
                    <span className="text-[10px] text-[#96A9CC] block">Real sig'im</span>
                    <span className="text-sm font-bold font-mono text-[#F0F4FC]">
                      {battery ? `${battery.current_capacity} mAh` : '--'}
                    </span>
                  </div>
                  <div className="bg-[#071536] rounded-lg p-2 border border-[#132B5C]">
                    <span className="text-[10px] text-[#96A9CC] block">Zavod sig'imi</span>
                    <span className="text-sm font-bold font-mono text-[#F0F4FC]">
                      {battery ? `${battery.design_capacity} mAh` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hardware Parts Authenticity */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#96A9CC] block">Qismlar tekshiruvi:</span>
                
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between bg-[#030A1C] border border-[#132B5C] rounded-lg px-3 py-2">
                    <span className="text-[#F0F4FC]">Ekran (Display):</span>
                    <span className="text-[#10B981] flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> OEM Zavod qismi
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-[#030A1C] border border-[#132B5C] rounded-lg px-3 py-2">
                    <span className="text-[#F0F4FC]">Batareya holati:</span>
                    <span className="text-[#10B981] flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Original seriya
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-[#030A1C] border border-[#132B5C] rounded-lg px-3 py-2">
                    <span className="text-[#F0F4FC]">iCloud / FMI:</span>
                    <span className="text-[#10B981] flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Clean / Toza
                    </span>
                  </div>
                </div>
              </div>

              {/* Cable Port Speed */}
              <div className="flex items-center justify-between pt-1 text-xs text-[#96A9CC]">
                <span>Ulanish porti:</span>
                <span className="font-mono text-[#00F0FF] font-semibold">
                  {device.connection.bus_type}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
