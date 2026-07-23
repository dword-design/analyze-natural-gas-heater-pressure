import { promises as fs } from 'node:fs'
import path from 'node:path'

interface PhotoItem {
  fileName: string
  relativePath: string
  url: string
  modifiedAt: string
  modifiedAtMs: number
}

const MIN_PHOTO_DATE_MS = new Date(2026, 6, 1).getTime()

function dayKeyFromIso(dateIso: string): string {
  const d = new Date(dateIso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()

  const jpgFiles = await collectJpgFiles(config.photosDir)

  const itemsWithStatsAll: PhotoItem[] = await Promise.all(
    jpgFiles.map(async (relativePath) => {
      const absolutePath = path.join(config.photosDir, relativePath)
      const stats = await fs.stat(absolutePath)
      return {
        fileName: path.basename(relativePath),
        relativePath,
        url: `/api/photo/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`,
        modifiedAt: stats.mtime.toISOString(),
        modifiedAtMs: stats.mtimeMs
      }
    })
  )

  const itemsWithStats = itemsWithStatsAll.filter((item) => item.modifiedAtMs >= MIN_PHOTO_DATE_MS)

  itemsWithStats.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs)

  const dayKeys = new Set<string>()
  for (const item of itemsWithStats) {
    dayKeys.add(dayKeyFromIso(item.modifiedAt))
  }

  const total = itemsWithStats.length
  const totalDays = dayKeys.size

  return {
    totalDays,
    total,
    items: itemsWithStats
  }
})
