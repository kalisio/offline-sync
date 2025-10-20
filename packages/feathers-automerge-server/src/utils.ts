import createDebug from 'debug'
import path from 'node:path'
import { promises as fs } from 'fs'
import { Repo, RepoConfig } from '@automerge/automerge-repo'
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs'
import type { RootDocument } from './sync-service.js'

const debug = createDebug('feathers-automerge-server/utils')

export function createRepo(dir: string, options: Omit<RepoConfig, 'storage'> = {}) {
  return new Repo({
    storage: new NodeFSStorageAdapter(dir),
    ...options
  })
}

export async function createRootDocument(directory: string, initialData: RootDocument) {
  const repo = createRepo(directory)
  const doc = repo.create(initialData)

  await repo.flush()

  debug(`Created root document ${doc.url}`)

  return doc
}

export function getRootDocumentPath(directory: string): string {
  return path.join(directory, 'automerge-server.json')
}

export async function readRootDocumentId(directory: string): Promise<string | null> {
  const filePath = getRootDocumentPath(directory)
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(content)
    return data.rootDocumentId || null
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function writeRootDocumentId(directory: string, rootDocumentId: string): Promise<void> {
  const filePath = getRootDocumentPath(directory)
  const data = { rootDocumentId }

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')

  debug(`Wrote root document ID to ${filePath}`)
}

export async function getRootDocumentId(
  directory: string,
  initialize: () => Promise<RootDocument>
): Promise<string> {
  const rootDocumentId = await readRootDocumentId(directory)

  if (!rootDocumentId) {
    debug('Root document ID not found, creating new root document')
    const initialData = await initialize()
    const doc = await createRootDocument(directory, initialData)

    await writeRootDocumentId(directory, doc.url)

    return doc.url
  }

  return rootDocumentId
}
