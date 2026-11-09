import React from 'react'
import { titlebarProps } from '../utils/windowDrag'

interface PageHeaderProps {
  title: string
  subtitle?: React.ReactNode
  children?: React.ReactNode
}

/** 52px unified toolbar: drags the window, double-click follows the macOS setting. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, children }) => (
  <header {...titlebarProps} className="ws-toolbar shrink-0 flex items-center justify-between gap-4 px-5">
    <div className="min-w-0 flex items-baseline gap-2">
      <h1 className="text-[15px] font-semibold text-white truncate">{title}</h1>
      {subtitle && <span className="text-[12px] text-[var(--ws-label-2)] truncate">{subtitle}</span>}
    </div>
    {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
  </header>
)
