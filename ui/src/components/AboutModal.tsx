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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-[#071536] border border-[#1E438A] shadow-2xl p-6 text-center overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#96A9CC] hover:text-white hover:bg-[#0F2A66] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 3D Hero Image */}
        <div className="relative mx-auto w-44 h-32 mb-4 flex items-center justify-center">
          <img
            src="/hero-about.png"
            alt="WireShift 3D Transfer Hero"
            className="w-full h-full object-contain rounded-xl drop-shadow-[0_12px_24px_rgba(1,87,252,0.4)]"
          />
        </div>

        {/* App Title & Version */}
        <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] mb-1">WireShift</h2>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#0157FC]/20 text-[#00F0FF] border border-[#0157FC]/40 mb-3">
          <span>v1.0.0 Production</span>
        </div>

        <p className="text-xs text-[#96A9CC] max-w-xs mx-auto mb-5 leading-relaxed">
          High-Speed Cable-Based iPhone Migration & Hardware Diagnostics System.
        </p>

        {/* System & Architecture Specs */}
        <div className="bg-[#030A1C] border border-[#132B5C] rounded-xl p-3 text-left text-xs space-y-2 mb-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[#96A9CC]">
              <Cpu className="w-3.5 h-3.5 text-[#00F0FF]" /> Usbmuxd Service
            </span>
            <span className={`font-mono font-medium ${status?.usbmuxd ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              {status?.usbmuxd ? '● Active (/var/run/usbmuxd)' : '○ Inactive'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[#96A9CC]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0157FC]" /> MobileDevice Bridge
            </span>
            <span className={`font-mono font-medium ${status?.libimobiledevice ? 'text-[#10B981]' : 'text-[#F59E0B]'}`}>
              {status?.libimobiledevice ? 'Ready (v1.4.0)' : 'Not Found'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[#96A9CC]">
              <HardDrive className="w-3.5 h-3.5 text-[#6B1DFD]" /> Application Bundle
            </span>
            <span className="font-mono text-[#F0F4FC]">
              {status?.bundle || 'uz.azimjondev.wireshift'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[11px] text-[#5A7199] flex items-center justify-center gap-1">
          <span>Designed & Built by Azimjon Dev</span>
          <span>•</span>
          <span>© 2026 WireShift</span>
        </div>
      </div>
    </div>
  )
}
