import React, { useState } from 'react'
import { ArrowRight, Copy, Image, Play, CheckCircle2 } from 'lucide-react'

interface TransferBridgeProps {
  hasSource: boolean
  hasTarget: boolean
  onStartMigration: (mode: 'full' | 'selective') => void
  isMigrating: boolean
  progress: number
  speedText: string
  etaText: string
}

export const TransferBridge: React.FC<TransferBridgeProps> = ({
  hasSource,
  hasTarget,
  onStartMigration,
  isMigrating,
  progress,
  speedText,
  etaText,
}) => {
  const [mode, setMode] = useState<'full' | 'selective'>('full')
  const canStart = hasSource && hasTarget && !isMigrating

  return (
    <div className="bg-[#061126] border border-[#132B5C] rounded-2xl p-5 shadow-2xl">
      {/* Mode Selection */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-[#F0F4FC] tracking-tight">Ko'chirish usulini tanlang:</h2>
          <p className="text-xs text-[#96A9CC]">
            {mode === 'full' 
              ? '1-REJIM: To\'liq nusxa ko\'chirish (SMS, kontaktlar, ilovalar, rasmlar, sozlamalar).'
              : '2-REJIM: Faqat Kamera rasmlari (DCIM), videolar va kontaktlarni tezkor o\'tkazish.'}
          </p>
        </div>

        <div className="flex items-center bg-[#030A1C] border border-[#132B5C] rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode('full')}
            disabled={isMigrating}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'full'
                ? 'bg-[#0157FC] text-white shadow-md shadow-[#0157FC]/30'
                : 'text-[#96A9CC] hover:text-white'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>1-Rejim: To'liq Klonlash</span>
          </button>

          <button
            onClick={() => setMode('selective')}
            disabled={isMigrating}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'selective'
                ? 'bg-[#6B1DFD] text-white shadow-md shadow-[#6B1DFD]/30'
                : 'text-[#96A9CC] hover:text-white'
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            <span>2-Rejim: Faqat Rasm & Kontakt</span>
          </button>
        </div>
      </div>

      {/* Migration Progress Bar (Visible when migrating or ready) */}
      {isMigrating ? (
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#00F0FF] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00F0FF] animate-ping" />
              Ma'lumotlar kabel orqali uzatilmoqda...
            </span>
            <div className="flex items-center gap-3 font-mono">
              <span className="text-[#10B981] font-bold">{speedText}</span>
              <span className="text-[#96A9CC]">Qolgan vaqt: {etaText}</span>
              <span className="text-[#F0F4FC] font-bold">{progress}%</span>
            </div>
          </div>

          {/* Progress Bar Track */}
          <div className="relative w-full h-3 bg-[#030A1C] rounded-full overflow-hidden border border-[#132B5C]">
            <div
              className="h-full bg-gradient-to-r from-[#0157FC] to-[#6B1DFD] transition-all duration-300 relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-2 bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]" />
            </div>
          </div>
        </div>
      ) : (
        /* Action CTA Bar */
        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-[#96A9CC]">
            {!hasSource && !hasTarget && '⚠️ Davom etish uchun ikkala telefonni ham kabel orqali ulang.'}
            {hasSource && !hasTarget && '⚠️ Yangi telefonni (Qabul qiluvchi) ham ulang.'}
            {!hasSource && hasTarget && '⚠️ Eski telefonni (Manba) ham ulang.'}
            {hasSource && hasTarget && (
              <span className="text-[#10B981] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Ikkala telefon tayyor. Ko'chirishni boshlashingiz mumkin.
              </span>
            )}
          </div>

          <button
            onClick={() => onStartMigration(mode)}
            disabled={!canStart}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all shadow-lg ${
              canStart
                ? 'bg-gradient-to-r from-[#0157FC] to-[#6B1DFD] hover:from-[#1A6CFF] hover:to-[#8236FC] text-white shadow-[#0157FC]/25 cursor-pointer hover:scale-[1.02]'
                : 'bg-[#0B2050] text-[#5A7199] cursor-not-allowed border border-[#132B5C]'
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>KO'CHIRISHNI BOSHLASH</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
