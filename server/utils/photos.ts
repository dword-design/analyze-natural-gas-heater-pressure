import { promises as fs } from 'node:fs'
import path from 'node:path'

export async function collectJpgFiles(rootDir: string, currentDir = ''): Promise<string[]> {
  const absoluteDir = path.join(rootDir, currentDir)
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryRelativePath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectJpgFiles(rootDir, entryRelativePath)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.JPG')) {
      files.push(entryRelativePath)
    }
  }

  return files
}
