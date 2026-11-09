import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'

// One handler pair for every custom titlebar/toolbar. We do NOT use
// data-tauri-drag-region, because Tauri's built-in script also toggles
// maximize on double-click and the two fought each other.

const INTERACTIVE = 'button, input, select, textarea, a, [role="button"], [data-no-drag]'

const isInteractive = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest(INTERACTIVE)

export const handleWindowDrag = (e: React.MouseEvent) => {
  // first click of a left-button press only; the second click belongs to double-click
  if (e.button !== 0 || e.detail !== 1 || isInteractive(e.target)) return
  getCurrentWindow()
    .startDragging()
    .catch((err) => console.debug('startDragging unavailable:', err))
}

export const handleWindowDoubleClick = (e: React.MouseEvent) => {
  if (e.button !== 0 || isInteractive(e.target)) return
  // Rust side follows System Settings > Desktop & Dock > "Double-click a window's title bar to"
  invoke('titlebar_double_click').catch((err) => console.debug('titlebar double-click:', err))
}

export const titlebarProps = {
  onMouseDown: handleWindowDrag,
  onDoubleClick: handleWindowDoubleClick,
}
