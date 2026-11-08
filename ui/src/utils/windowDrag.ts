import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Initiates native Tauri window drag on mousedown for custom titlebar/drag regions.
 * Ignores clicks on buttons, inputs, links, or elements marked with data-no-drag.
 */
export const handleWindowDrag = async (e: React.MouseEvent) => {
  // Only primary (left) mouse button
  if (e.button !== 0) return

  const target = e.target as HTMLElement
  if (target.closest('button, input, select, textarea, a, [data-no-drag]')) {
    return
  }

  try {
    const appWindow = getCurrentWindow()
    await appWindow.startDragging()
  } catch (err) {
    // In web browser dev preview, startDragging may not be available; ignore safely
    console.debug('Window startDragging not available or error:', err)
  }
}

/**
 * Toggles window maximize/restore on double clicking custom titlebars.
 */
export const handleWindowDoubleClick = async (e: React.MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.closest('button, input, select, textarea, a, [data-no-drag]')) {
    return
  }

  try {
    const appWindow = getCurrentWindow()
    await appWindow.toggleMaximize()
  } catch (err) {
    console.debug('Window toggleMaximize not available or error:', err)
  }
}
