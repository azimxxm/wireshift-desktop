import { useCallback, useState } from 'react'

export interface AppSettings {
  exportPath: string
  /** Save the matching .AAE edit file together with a selected photo */
  includeSidecars: boolean
  openFinderAfterExport: boolean
  /** Skip files already saved on the Mac with the same size */
  skipExisting: boolean
  thumbSize: number
}

const KEY = 'wireshift.settings.v1'

const DEFAULTS: AppSettings = {
  exportPath: '',
  includeSidecars: true,
  openFinderAfterExport: false,
  skipExisting: true,
  thumbSize: 168,
}

const load = (): AppSettings => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(load)

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // storage can be unavailable; settings just won't persist
      }
      return next
    })
  }, [])

  return { settings, update }
}
