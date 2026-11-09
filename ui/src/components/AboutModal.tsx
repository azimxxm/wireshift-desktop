import React, { useEffect } from 'react'
import { SystemStatus } from '../types'

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
  status: SystemStatus | null
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, status }) => {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="ws-sheet-in w-[300px] rounded-xl bg-[var(--ws-elevated)] border border-white/10 shadow-2xl px-6 pt-7 pb-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img src="/app-icon.png" alt="" className="w-16 h-16 mx-auto mb-3 rounded-[14px]" />
        <h2 className="text-[15px] font-semibold text-white">WireShift</h2>
        <p className="text-[12px] text-[var(--ws-label-2)] mt-0.5">Versiya {status?.version ?? '—'}</p>
        <p className="text-[12px] text-[var(--ws-label-2)] mt-3 leading-relaxed">
          iPhone'dan Mac'ga kabel orqali tez ko'chirish va qurilma diagnostikasi.
        </p>
        <div className="mt-4 text-[11px] text-[var(--ws-label-3)] space-y-0.5">
          <div>usbmuxd: {status?.usbmuxd ? 'ishlayapti' : 'topilmadi'}</div>
          <div>MobileDevice: {status?.libimobiledevice ? 'tayyor' : 'topilmadi'}</div>
        </div>
        <button className="ws-btn mt-5 w-full" onClick={onClose} autoFocus>
          Yopish
        </button>
        <p className="mt-3 text-[10px] text-[var(--ws-label-3)]">© 2026 WireShift</p>
      </div>
    </div>
  )
}
