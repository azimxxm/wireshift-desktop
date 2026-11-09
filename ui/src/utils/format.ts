export const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 ? 0 : value < 10 ? 1 : value < 100 ? 1 : 0
  return `${value.toFixed(digits)} ${units[unit]}`
}

/** wsmedia:// URL that streams a file straight from the phone (Range-capable). */
export const mediaUrl = (udid: string, devicePath: string) =>
  `wsmedia://localhost/${udid}/${encodeURIComponent(devicePath)}`

const MONTHS: Record<string, string> = {
  Jan: 'yan', Feb: 'fev', Mar: 'mar', Apr: 'apr', May: 'may', Jun: 'iyn',
  Jul: 'iyl', Aug: 'avg', Sep: 'sen', Oct: 'okt', Nov: 'noy', Dec: 'dek',
}

/** afcclient `ls -l` dates look like "Nov 06 2026 09:54:01" or "06 Nov 2026 ..." */
export const formatShortDate = (raw: string): string => {
  if (!raw) return ''
  const parts = raw.split(/\s+/)
  const month = parts.find((p) => MONTHS[p])
  const day = parts.find((p) => /^\d{1,2}$/.test(p))
  if (month && day) return `${parseInt(day, 10)}-${MONTHS[month]}`
  return parts.slice(0, 2).join(' ')
}

/** "107APPLE/IMG_7214" — pairs a photo with its .AAE edit file */
export const sidecarKey = (album: string, name: string) => `${album}/${name.replace(/\.[^.]+$/, '').toUpperCase()}`
