import React, { useState } from 'react'
import {
  ArrowRight,
  Copy,
  Image,
  Play,
  CheckCircle2,
  Laptop,
  Smartphone,
  FolderOpen,
  CheckSquare,
  Square,
  Film,
  Zap,
  Gauge,
  X
} from 'lucide-react'

interface TransferBridgeProps {
  hasSource: boolean
  hasTarget: boolean
  targetMode: 'phone' | 'pc'
  onToggleTargetMode: (mode: 'phone' | 'pc') => void
  onStartMigration: (mode: 'full' | 'selective') => void
  isMigrating: boolean
  progress: number
  speedText: string
  etaText: string
  dcimCount?: number
  copiedCount?: number
  copiedBytes?: number
  currentAlbum?: string
  isExportSuccess?: boolean
  onOpenExportFolder?: () => void
  onOpenMediaExplorer?: () => void
  onOpenCableSpeed?: () => void
  onCancelMigration?: () => void
  isCableThrottled?: boolean
  selectedCategories: {
    photos: boolean
    contacts: boolean
    files: boolean
  }
  onToggleCategory: (cat: 'photos' | 'contacts' | 'files') => void
}

export const TransferBridge: React.FC<TransferBridgeProps> = ({
  hasSource,
  hasTarget,
  targetMode,
  onToggleTargetMode,
  onStartMigration,
  isMigrating,
  progress,
  speedText,
  etaText,
  dcimCount = 0,
  copiedCount = 0,
  copiedBytes = 0,
  currentAlbum = '',
  isExportSuccess = false,
  onOpenExportFolder,
  onOpenMediaExplorer,
  onOpenCableSpeed,
  onCancelMigration,
  isCableThrottled = false,
  selectedCategories,
  onToggleCategory,
}) => {
  const [migrationType, setMigrationType] = useState<'full' | 'selective'>('selective')

  const isPcMode = targetMode === 'pc'
  const canStart = isPcMode
    ? hasSource && !isMigrating && (selectedCategories.photos || selectedCategories.contacts || selectedCategories.files)
    : hasSource && hasTarget && !isMigrating

  return (
    <div className="apple-glass rounded-2xl p-6 shadow-2xl space-y-5">
      {/* Target Destination Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">Qayerga yuklab olmoqchisiz?</h2>
          <p className="text-xs text-white/60">
            {isPcMode
              ? '1 ta telefon kifoya: fayllar to\'g\'ridan-to\'g\'ri Mac/PC kompyuteringizga yuqori tezlikda saqlanadi.'
              : '2 ta telefon kerak: ma\'lumotlar eski telefondan yangisiga to\'liq ko\'chiriladi.'}
          </p>
        </div>

        <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 gap-1 shrink-0">
          <button
            onClick={() => onToggleTargetMode('pc')}
            disabled={isMigrating}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              isPcMode
                ? 'bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/25 font-semibold'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>💻 Ushbu Mac/PC ga</span>
          </button>

          <button
            onClick={() => onToggleTargetMode('phone')}
            disabled={isMigrating}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              !isPcMode
                ? 'bg-[#5E5CE6] text-white shadow-md shadow-[#5E5CE6]/30 font-semibold'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>📱 2-chi iPhone'ga</span>
          </button>
        </div>
      </div>

      {/* Category Checkboxes */}
      {isPcMode ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/70">Yuklab olinadigan toifalarni tanlang:</span>
            {isCableThrottled && onOpenCableSpeed && (
              <button
                onClick={onOpenCableSpeed}
                className="text-[11px] text-[#F59E0B] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Gauge className="w-3 h-3" />
                <span>Kabel tezligini test qilish (~35 MB/s)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Photos & Videos */}
            <button
              onClick={() => onToggleCategory('photos')}
              disabled={isMigrating}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedCategories.photos
                  ? 'bg-[#0A84FF]/10 border-[#0A84FF]/40 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:border-white/[0.12]'
              }`}
            >
              {selectedCategories.photos ? (
                <CheckSquare className="w-4 h-4 text-[#0A84FF] shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-white/30 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold block truncate">📸 Rasmlar & Videolar</span>
                <span className="text-[10px] text-white/50 font-mono">
                  {dcimCount > 0 ? `${dcimCount} ta media fayl` : 'Barcha albomlar'}
                </span>
              </div>
            </button>

            {/* Contacts */}
            <button
              onClick={() => onToggleCategory('contacts')}
              disabled={isMigrating}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedCategories.contacts
                  ? 'bg-[#0A84FF]/10 border-[#0A84FF]/40 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:border-white/[0.12]'
              }`}
            >
              {selectedCategories.contacts ? (
                <CheckSquare className="w-4 h-4 text-[#0A84FF] shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-white/30 shrink-0" />
              )}
              <div className="min-w-0">
                <span className="text-xs font-semibold block truncate">👤 Kontaktlar</span>
                <span className="text-[10px] text-white/50">vCard (.vcf) zaxira</span>
              </div>
            </button>

            {/* Other Media / Files */}
            <button
              onClick={() => onToggleCategory('files')}
              disabled={isMigrating}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedCategories.files
                  ? 'bg-[#0A84FF]/10 border-[#0A84FF]/40 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:border-white/[0.12]'
              }`}
            >
              {selectedCategories.files ? (
                <CheckSquare className="w-4 h-4 text-[#0A84FF] shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-white/30 shrink-0" />
              )}
              <div className="min-w-0">
                <span className="text-xs font-semibold block truncate">📁 Boshqa Media & Fayllar</span>
                <span className="text-[10px] text-white/50">Hujjatlar va fayllar</span>
              </div>
            </button>
          </div>

          {/* DEDICATED SEPARATE BUTTON / CARD: Photos & Media Selective Explorer */}
          {onOpenMediaExplorer && (
            <div
              onClick={onOpenMediaExplorer}
              className="p-4 rounded-xl apple-glass-interactive flex items-center justify-between cursor-pointer group mt-2"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/12 border border-[#0A84FF]/25 flex items-center justify-center text-[#0A84FF] shadow-sm">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      Rasmlar va Videolarni saralab tanlash
                    </span>
                    <span className="text-[10px] font-semibold bg-[#0A84FF]/15 text-[#0A84FF] px-2 py-0.5 rounded-full border border-[#0A84FF]/25">
                      Alohida saralash
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    Barcha fayllarni emas, faqat kerakli video va fotosuratlarni saralab, Mac'ga alohida yuklab oling.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0A84FF] group-hover:translate-x-1 transition-transform shrink-0">
                <span>Galereyani ochish</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Phone-to-Phone Mode Switcher */
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-white">Ko'chirish usuli:</h3>
            <p className="text-[11px] text-white/60">
              {migrationType === 'full'
                ? 'To\'liq klonlash: Ilovalar, SMS, sozlamalar va xotirani yangi telefonga o\'tkazish.'
                : 'Faqat kamera rasmlari (DCIM), videolar va kontaktlarni tezkor o\'tkazish.'}
            </p>
          </div>
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 gap-1">
            <button
              onClick={() => setMigrationType('full')}
              disabled={isMigrating}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                migrationType === 'full'
                  ? 'bg-[#0A84FF] text-white shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>To'liq Klonlash</span>
            </button>
            <button
              onClick={() => setMigrationType('selective')}
              disabled={isMigrating}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                migrationType === 'selective'
                  ? 'bg-[#5E5CE6] text-white shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Image className="w-3.5 h-3.5" />
              <span>Faqat Rasm & Kontakt</span>
            </button>
          </div>
        </div>
      )}

      {/* Migration / Export Progress Bar */}
      {isMigrating ? (
        <div className="space-y-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl p-4.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-white flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-[#0A84FF] animate-ping shrink-0" />
              {isPcMode ? (
                <span>
                  {currentAlbum ? `Albom: ${currentAlbum} yuklanmoqda...` : 'Fayllar kompyuterga yozilmoqda...'}
                  {copiedCount > 0 && dcimCount > 0 && (
                    <span className="text-white/50 ml-2 font-mono">
                      ({copiedCount} / {dcimCount} ta fayl)
                    </span>
                  )}
                </span>
              ) : (
                'Telefonlar o\'rtasida uzatilmoqda...'
              )}
            </span>
            <div className="flex items-center gap-3 font-mono shrink-0">
              {copiedBytes > 0 && (
                <span className="text-[#0A84FF] font-semibold text-[11px] px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                  {(copiedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB yuklandi
                </span>
              )}
              <span className="text-[#30D158] font-bold">{speedText}</span>
              <span className="text-white/50">Qolgan: {etaText}</span>
              <span className="text-white font-bold text-sm">{progress}%</span>
              {onCancelMigration && (
                <button
                  onClick={onCancelMigration}
                  className="ml-2 px-3 py-1 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                  title="Yuklashni to'xtatish"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Bekor qilish</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative w-full h-3 bg-white/[0.05] rounded-full overflow-hidden border border-white/[0.08]">
            <div
              className="h-full bg-gradient-to-r from-[#0A84FF] to-[#30D158] transition-all duration-300 relative rounded-full"
              style={{ width: `${Math.max(progress, 3)}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-2 bg-white shadow-[0_0_8px_white]" />
            </div>
          </div>
        </div>
      ) : (
        /* Action CTA Bar */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-xs text-white/60">
            {isPcMode ? (
              !hasSource ? (
                '⚠️ iPhone\'ni kabel orqali kompyuterga ulang.'
              ) : isExportSuccess ? (
                <span className="text-[#30D158] font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#30D158]" />
                  Fayllar kompyuterga muvaffaqiyatli yuklandi!
                </span>
              ) : (
                <span className="text-white/60">
                  USB orqali to'g'ridan-to'g'ri asl sifatda (HEIC / 4K ProRes) yoziladi.
                </span>
              )
            ) : !hasSource && !hasTarget ? (
              '⚠️ Davom etish uchun ikkala telefonni ham kabel orqali ulang.'
            ) : hasSource && !hasTarget ? (
              '⚠️ Yangi telefonni (Qabul qiluvchi) ham ulang.'
            ) : (
              <span className="text-[#30D158] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Ikkala telefon tayyor.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {isExportSuccess && onOpenExportFolder && (
              <button
                onClick={onOpenExportFolder}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.09] text-white border border-white/[0.08] transition-all cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Finder'da ochish</span>
              </button>
            )}

            <button
              onClick={() => onStartMigration(migrationType)}
              disabled={!canStart}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-xs tracking-wide transition-all shadow-lg ${
                canStart
                  ? 'bg-[#0A84FF] hover:bg-[#0071E3] active:scale-[0.99] text-white shadow-[#0A84FF]/25 cursor-pointer'
                  : 'bg-white/[0.04] text-white/30 cursor-not-allowed border border-white/[0.06]'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isPcMode ? 'KOMPYUTERGA YUKLASHNI BOSHLASH' : 'KO\'CHIRISHNI BOSHLASH'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
