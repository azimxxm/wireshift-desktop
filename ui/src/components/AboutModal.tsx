import React from 'react'
import { X, Cpu, ShieldCheck, HardDrive, ExternalLink } from 'lucide-react'
import { SystemStatus } from '../types'

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
  status: SystemStatus | null
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, status }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md rounded-2xl apple-glass p-6 text-center overflow-hidden shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 3D Hero Image */}
        <div className="relative mx-auto w-40 h-28 mb-3 flex items-center justify-center">
          <img
            src="/hero-about.png"
            alt="WireShift 3D Transfer Hero"
            className="w-full h-full object-contain rounded-xl drop-shadow-[0_12px_24px_rgba(10,132,255,0.3)]"
          />
        </div>

        {/* App Title & Version */}
        <h2 className="text-xl font-bold tracking-tight text-white mb-0.5">WireShift</h2>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30 mb-3">
          <span>v1.0.1 Production • macOS Native</span>
        </div>

        <p className="text-xs text-white/60 max-w-xs mx-auto mb-5 leading-relaxed">
          High-Speed Cable-Based iPhone Migration & Hardware Diagnostics System.
        </p>

        {/* System & Architecture Specs */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 text-left text-xs space-y-2 mb-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white/60">
              <Cpu className="w-3.5 h-3.5 text-[#0A84FF]" /> Usbmuxd Service
            </span>
            <span className={`font-mono font-medium ${status?.usbmuxd ? 'text-[#30D158]' : 'text-[#EF4444]'}`}>
              {status?.usbmuxd ? '● Active (/var/run/usbmuxd)' : '○ Inactive'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white/60">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0A84FF]" /> MobileDevice Bridge
            </span>
            <span className={`font-mono font-medium ${status?.libimobiledevice ? 'text-[#30D158]' : 'text-[#F59E0B]'}`}>
              {status?.libimobiledevice ? 'Ready (v1.4.0)' : 'Not Found'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white/60">
              <HardDrive className="w-3.5 h-3.5 text-[#0A84FF]" /> High-Speed Channel
            </span>
            <span className="text-white/80 font-mono">USB 3.2 Gen 2 / Direct AFC</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-white/40 pt-2 border-t border-white/[0.06]">
          <span>© 2026 WireShift App</span>
          <span className="text-white/30">Designed for Apple Silicon</span>
        </div>
      </div>
    </div>
  )
}
