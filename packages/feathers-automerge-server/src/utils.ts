import createDebug from 'debug'
import path from 'node:path'
import { promises as fs } from 'fs'
import { Repo, RepoConfig } from '@automerge/automerge-repo'
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs'
import type { RootDocument, SyncServiceOptions } from './sync-service.js'
import type { Application } from '@feathersjs/express'

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

export interface SyncServerOptions extends SyncServiceOptions {
  directory: string
  serverId: string
  syncServicePath: string
  rootDocumentId?: string
  authenticate: (app: Application, accessToken: string | null) => Promise<boolean>
  getAccessToken?: (app: Application) => Promise<string>
  syncServerUrl?: string
  syncServerWsPath?: string
}

export function validateSyncServerOptions(options: SyncServerOptions): options is SyncServerOptions {
  if (!options || typeof options !== 'object') {
    throw new Error('SyncServerOptions must be an object')
  }

  if (typeof options.directory !== 'string' || options.directory.trim() === '') {
    throw new Error('SyncServerOptions.directory must be a non-empty string')
  }

  if (typeof options.serverId !== 'string' || options.serverId.trim() === '') {
    throw new Error('SyncServerOptions.serverId must be a non-empty string')
  }

  if (typeof options.syncServicePath !== 'string' || options.syncServicePath.trim() === '') {
    throw new Error('SyncServerOptions.syncServicePath must be a non-empty string')
  }

  if (typeof options.authenticate !== 'function') {
    throw new Error('SyncServerOptions.authenticate must be a function')
  }

  if (typeof options.canAccess !== 'function') {
    throw new Error('SyncServerOptions.canAccess must be a function')
  }

  if (typeof options.initializeDocument !== 'function') {
    throw new Error('SyncServerOptions.initializeDocument must be a function')
  }

  if (typeof options.getDocumentsForData !== 'function') {
    throw new Error('SyncServerOptions.getDocumentsForData must be a function')
  }

  return true
}
