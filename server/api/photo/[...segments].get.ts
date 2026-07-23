import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const segments = getRouterParam(event, 'segments')

  if (!segments) {
    throw createError({ statusCode: 400, statusMessage: 'Missing photo path.' })
  }

  const decodedSegments = segments
    .split('/')
    .map((segment) => decodeURIComponent(segment))

  const relativePath = path.join(...decodedSegments)

  if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid photo path.' })
  }

  if (!relativePath.endsWith('.JPG')) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found.' })
  }

  const absolutePath = path.resolve(config.photosDir, relativePath)
  const expectedRoot = path.resolve(config.photosDir) + path.sep

  if (!absolutePath.startsWith(expectedRoot)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid photo path.' })
  }

  try {
    const stat = await fs.stat(absolutePath)
    if (!stat.isFile()) {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found.' })
    }
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found.' })
  }

  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Cache-Control', 'public, max-age=300')

  return sendStream(event, createReadStream(absolutePath))
})
