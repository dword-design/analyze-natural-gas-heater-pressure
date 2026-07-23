import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getDb } from '~/server/utils/db'
import { collectJpgFiles } from '~/server/utils/photos'

const THRESHOLD_MS = 15 * 60 * 1000
const MIN_PHOTO_DATE_MS = new Date(2026, 6, 1).getTime()

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const { manualTimelineEntityUuids, ...dbConfig } = config as unknown as {
    dbHost: string
    dbName: string
    dbPassword: string
    dbPort: string
    dbUser: string
    manualTimelineEntityUuids: string[]
  }
  const db = getDb({
    dbHost: dbConfig.dbHost,
    dbName: dbConfig.dbName,
    dbPassword: dbConfig.dbPassword,
    dbPort: dbConfig.dbPort,
    dbUser: dbConfig.dbUser
  })

  // Collect all JPG files with their modification timestamps
  const jpgRelativePaths = await collectJpgFiles(config.photosDir)
  const allPhotos = await Promise.all(
    jpgRelativePaths.map(async (relativePath) => {
      const absolutePath = path.join(config.photosDir, relativePath)
      const stats = await fs.stat(absolutePath)
      return { relativePath, modifiedAtMs: stats.mtimeMs }
    })
  )

  const photos = allPhotos.filter((photo) => photo.modifiedAtMs >= MIN_PHOTO_DATE_MS)

  // Query foto: entities plus manual include IDs, ordered newest-first.
  let entitiesQuery = db
    .selectFrom('entities')
    .select(['id', 'content', 'created_time'])

  if (manualTimelineEntityUuids.length > 0) {
    entitiesQuery = entitiesQuery.where((eb) =>
      eb.or([
        eb('content', 'like', 'foto:%'),
        eb('id', 'in', manualTimelineEntityUuids)
      ])
    )
  } else {
    entitiesQuery = entitiesQuery.where('content', 'like', 'foto:%')
  }

  const entities = await entitiesQuery
    .orderBy('created_time', 'desc')
    .execute()
  
  type Entity = (typeof entities)[number] & { created_time: string }
  const manualEntityIds = new Set(manualTimelineEntityUuids)

  const standaloneTimelineAnnotations: Entity[] = []
  const unmatchedPhotoAnnotations: Entity[] = []
  const photoMatchedAnnotations: { relativePath: string; entity: Entity }[] = []

  for (const entity of entities) {
    const ent = entity as Entity

    // Manual timeline UUIDs are shown as standalone rows, not photo-matched.
    if (manualEntityIds.has(entity.id)) {
      standaloneTimelineAnnotations.push(ent)
      continue
    }

    const entityMs = new Date(entity.created_time).getTime()
    let bestRelativePath: string | null = null
    let bestDiff = Infinity

    for (const photo of photos) {
      const diff = Math.abs(photo.modifiedAtMs - entityMs)
      if (diff < bestDiff) {
        bestDiff = diff
        bestRelativePath = photo.relativePath
      }
    }

    if (bestRelativePath !== null && bestDiff <= THRESHOLD_MS) {
      photoMatchedAnnotations.push({ relativePath: bestRelativePath, entity: ent })
    } else {
      unmatchedPhotoAnnotations.push(ent)
    }
  }

  return {
    unmatchedPhotoAnnotations,
    photoMatchedAnnotations,
    standaloneTimelineAnnotations
  }
})
