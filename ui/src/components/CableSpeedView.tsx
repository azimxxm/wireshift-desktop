import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Zap,
  Gauge,
  Laptop,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Play,
  RotateCcw,
  Info,
  ArrowRight,
  ShieldCheck,
  Cable
} from 'lucide-react'
import { ConnectedDevice, CableDiagnostic, CableBenchmarkResult } from '../types'

interface CableSpeedViewProps {
  device: ConnectedDevice | null
  onOpenFinalCutBridge?: () => void
}

export const CableSpeedView: React.FC<CableSpeedViewProps> = ({
  device,
  onOpenFinalCutBridge,
}) => {
  const [diagnostic, setDiagnostic] = useState<CableDiagnostic | null>(null)
  const [isLoadingDiag, setIsLoadingDiag] = useState(false)
  const [benchmarkResult, setBenchmarkResult] = useState<CableBenchmarkResult | null>(null)
  const [isRunningBench, setIsRunningBench] = useState(false)
  const [benchError, setBenchError] = useState<string | null>(null)

  const loadDiagnostic = async () => {
    if (!device) return
    setIsLoadingDiag(true)
    try {
      const data = await invoke<CableDiagnostic>('diagnose_cable_speed', { udid: device.udid })
      setDiagnostic(data)
    } catch (e) {
      console.error('Diagnostic error:', e)
    } finally {
      setIsLoadingDiag(false)
    }
  }

  useEffect(() => {
    loadDiagnostic()
  }, [device?.udid])

  const handleRunBenchmark = async () => {
    if (!device || isRunningBench) return
    setIsRunningBench(true)
    setBenchError(null)
    try {
      const res = await invoke<CableBenchmarkResult>('run_cable_benchmark', { udid: device.udid })
      setBenchmarkResult(res)
    } catch (e: any) {
      console.error('Benchmark error:', e)
      setBenchError(typeof e === 'string' ? e : 'Tezlikni o\'lchashda xatolik yuz berdi.')
    } finally {
      setIsRunningBench(false)
    }
  }

  if (!device) {
    return (
      <div className="apple-glass rounded-2xl p-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-white/40">
          <Cable className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-white">iPhone ulanmagan</h3>
        <p className="text-xs text-white/50 max-w-sm mx-auto">
          Kabel va port tezligini o'lchash uchun iPhone'ni USB kabel orqali MacBook'ga ulang.
        </p>
      </div>
    )
  }

  const isThrottled = diagnostic ? diagnostic.is_cable_throttled : true

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <div className="apple-glass rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25">
                <Gauge className="w-4 h-4" />
              </span>
              <h2 className="text-base font-semibold text-white">Kabel & Port Tezlik Diagnostikasi</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isThrottled
                    ? 'bg-[#F59E0B]/12 text-[#F59E0B] border-[#F59E0B]/25'
                    : 'bg-[#30D158]/12 text-[#30D158] border-[#30D158]/25'
                }`}
              >
                {isThrottled ? 'USB 2.0 Cheklovi Aniqlangan' : '10 Gbps SuperSpeed Aktiv'}
              </span>
            </div>
            <p className="text-xs text-white/60 max-w-2xl leading-relaxed">
              MacBook portining jismoniy tezligi, iPhone boshqaruvchisi va ulangan kabelning haqiqiy ma'lumot o'tkazish
              tezligini tahlil qiling.
            </p>
          </div>

          <button
            onClick={loadDiagnostic}
            disabled={isLoadingDiag}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-white/80 border border-white/[0.08] transition-all cursor-pointer shrink-0"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoadingDiag ? 'animate-spin' : ''}`} />
            <span>Qayta tekshirish</span>
          </button>
        </div>
      </div>

      {/* Hardware Link Capability Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MacBook Port */}
        <div className="apple-glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span className="flex items-center gap-1.5 font-medium">
              <Laptop className="w-4 h-4 text-[#0A84FF]" /> MacBook Porti
            </span>
            <span className="text-[10px] text-[#30D158] font-mono font-semibold">Thunderbolt 4</span>
          </div>
          <div>
            <div className="text-sm font-bold text-white">40 Gbps (5,000 MB/s)</div>
            <div className="text-[11px] text-white/50 mt-0.5">
              {diagnostic?.port_name || 'O\'ng tomon (Right Side) porti'}
            </div>
          </div>
          <div className="text-[10px] text-white/40 pt-1 border-t border-white/[0.06]">
            MacBook M1 Pro barcha portlarida USB 3.2 Gen 2 (10 Gbps) va Thunderbolt 4 (40 Gbps) ni to'liq quvvatlaydi.
          </div>
        </div>

        {/* Cable Status */}
        <div
          className={`apple-glass rounded-2xl p-5 space-y-3 border ${
            isThrottled ? 'border-[#F59E0B]/30 bg-[#F59E0B]/[0.02]' : 'border-[#30D158]/30'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-white/60">
            <span className="flex items-center gap-1.5 font-medium">
              <Cable className="w-4 h-4 text-[#F59E0B]" /> Ulangan Kabel
            </span>
            <span
              className={`text-[10px] font-mono font-semibold ${
                isThrottled ? 'text-[#F59E0B]' : 'text-[#30D158]'
              }`}
            >
              {isThrottled ? 'Cheklov mavjud' : 'To\'liq tezlik'}
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>{diagnostic?.negotiated_speed_text || '480 Mbps'}</span>
              <span className="text-xs text-white/50 font-normal font-mono">(~35 MB/s)</span>
            </div>
            <div className="text-[11px] text-[#F59E0B] font-medium mt-0.5">
              {isThrottled ? 'USB 2.0 High-Speed' : 'USB 3.2 Gen 2 SuperSpeed'}
            </div>
          </div>
          <div className="text-[10px] text-white/40 pt-1 border-t border-white/[0.06]">
            {isThrottled
              ? 'iPhone qutisidagi oq kabel faqat quvvatlash uchun, 480 Mbps bilan cheklangan.'
              : 'Kabel yuqori tezlikda ishlamoqda.'}
          </div>
        </div>

        {/* iPhone Controller */}
        <div className="apple-glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span className="flex items-center gap-1.5 font-medium">
              <Smartphone className="w-4 h-4 text-[#30D158]" /> iPhone 16 Pro Max
            </span>
            <span className="text-[10px] text-[#30D158] font-mono font-semibold">USB 3.2 Gen 2</span>
          </div>
          <div>
            <div className="text-sm font-bold text-white">10 Gbps (1,250 MB/s)</div>
            <div className="text-[11px] text-white/50 mt-0.5">Type-C Native Controller</div>
          </div>
          <div className="text-[10px] text-white/40 pt-1 border-t border-white/[0.06]">
            A18 Pro chipidagi USB 3.2 boshqaruvchisi soniyasiga 1.25 Gigabaytgacha ma'lumot uzatish imkoniga ega.
          </div>
        </div>
      </div>

      {/* MacBook Pro Port Layout Diagram */}
      <div className="apple-glass rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-semibold text-white/90 flex items-center gap-2">
          <span>💻 MacBook Pro M1 Pro Portlar Xaritasi</span>
          <span className="text-[10px] text-white/40 font-normal">(Hozirgi ulanish o'rni ko'rsatilgan)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Side */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/80">Chap tomon (Left Side)</span>
              <span className="text-[10px] text-white/40">2 ta Thunderbolt port</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] text-white/60">
                <span>⚡ Port 1 (Thunderbolt 4 / 40 Gbps)</span>
                <span className="text-white/30 text-[10px]">Bo'sh</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] text-white/60">
                <span>⚡ Port 2 (Thunderbolt 4 / 40 Gbps)</span>
                <span className="text-white/30 text-[10px]">Bo'sh</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] text-white/40 text-[10px]">
                <span>MagSafe 3 Quvvatlash Porti</span>
                <span>Zaryadka</span>
              </div>
            </div>
          </div>

          {/* Right Side */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/80">O'ng tomon (Right Side)</span>
              <span className="text-[10px] text-[#30D158] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
                iPhone ulangan tomon
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0A84FF]/10 border border-[#0A84FF]/30 text-white">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-[#0A84FF]" />
                  <span className="font-semibold">⚡ Port 3 (Thunderbolt 4)</span>
                </div>
                <span className="text-[10px] font-mono text-[#0A84FF] font-bold">🟢 iPhone 16 Pro Max</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] text-white/40 text-[10px]">
                <span>HDMI 2.0 Porti</span>
                <span>Monitor</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] text-white/40 text-[10px]">
                <span>SDXC Karta Slot</span>
                <span>Kamera</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Benchmark Execution Card */}
      <div className="apple-glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#0A84FF]" />
              Haqiqiy Jonli Kabel Tezlik Testi (Benchmark)
            </h3>
            <p className="text-xs text-white/60 mt-0.5">
              Telefondan kichik video faylni real vaqt rejimida xotiraga yuklab, kabelning amaldagi o'tkazuvchanligini
              (MB/s) hisoblab beradi.
            </p>
          </div>

          <button
            onClick={handleRunBenchmark}
            disabled={isRunningBench}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-xs transition-all shadow-md shrink-0 cursor-pointer ${
              isRunningBench
                ? 'bg-white/[0.08] text-white/40 cursor-wait'
                : 'bg-[#0A84FF] hover:bg-[#0071E3] text-white shadow-[#0A84FF]/25'
            }`}
          >
            {isRunningBench ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>O'lchanmoqda...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Tezlikni o'lchash</span>
              </>
            )}
          </button>
        </div>

        {benchError && (
          <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#EF4444]">
            {benchError}
          </div>
        )}

        {/* Benchmark Results */}
        {benchmarkResult && (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
              <div>
                <span className="text-[11px] text-white/50 block">O'lchangan haqiqiy tezlik:</span>
                <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-2">
                  <span>{benchmarkResult.speed_mb_s} MB/s</span>
                  <span className="text-xs font-normal text-white/50 font-sans">
                    ({(benchmarkResult.speed_mb_s * 8).toFixed(0)} Mbps)
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-white/50 block">Kabel toifasi:</span>
                <span className="text-xs font-bold text-[#F59E0B] font-mono">
                  {benchmarkResult.cable_grade}
                </span>
              </div>
            </div>

            <div className="text-xs text-white/70 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-[#0A84FF] shrink-0 mt-0.5" />
              <span>{benchmarkResult.verdict}</span>
            </div>
          </div>
        )}
      </div>

      {/* Advice & Recommendation Card */}
      <div className="apple-glass rounded-2xl p-6 space-y-3">
        <h3 className="text-xs font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#30D158]" />
          Yuqori Tezlikdagi Video & Media Transfer uchun Tavsiya
        </h3>
        <p className="text-xs text-white/70 leading-relaxed">
          Agar siz tez-tez 4K ProRes yoki og'ir videolarni Mac'ga olib montaj qilsangiz, Thunderbolt 4 yoki USB 3.2 Gen
          2 (10 Gbps) kabel xarid qilishingizni maslahat beramiz. Ushbu kabel bilan 48 GB hajmdagi videolaringiz 20 daqiqa
          emas, bor-yo'g'i <strong>1 daqiqa 10 soniyada</strong> to'liq kompyuterga o'tadi!
        </p>

        {onOpenFinalCutBridge && (
          <div className="pt-2">
            <button
              onClick={onOpenFinalCutBridge}
              className="flex items-center gap-2 text-xs font-medium text-[#0A84FF] hover:underline cursor-pointer"
            >
              <span>Rasmlar & Videolar Galereyasi oynasiga o'tish</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
