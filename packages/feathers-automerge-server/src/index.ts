import { AnyDocumentId, PeerId, Repo, RepoConfig } from '@automerge/automerge-repo'
import { Application, NextFunction } from '@feathersjs/feathers'
import {
  BrowserWebSocketClientAdapter,
  NodeWSServerAdapter
} from '@automerge/automerge-repo-network-websocket'
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs'
import { WebSocketServer } from 'ws'
import type { Server as HttpServer } from 'http'
import { AutomergeSyncService, type SyncServiceOptions, type RootDocument } from './sync-service.js'
import createDebug from 'debug'
import { promises as fs } from 'fs'
import path from 'path'

const debug = createDebug('feathers-automerge-server')

export function createRepo(dir: string, options: Omit<RepoConfig, 'storage'> = {}) {
  return new Repo({
    storage: new NodeFSStorageAdapter(dir),
    ...options
  })
}

export async function createRootDocument(directory: string) {
  const repo = createRepo(directory)
  const doc = repo.create({
    documents: []
  })
  await repo.flush()

  debug(`Created root document ${doc.url}`)

  return doc
}

function getRootDocumentPath(directory: string): string {
  return path.join(directory, 'automerge-server.json')
}

async function readRootDocumentId(directory: string): Promise<string | null> {
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

async function writeRootDocumentId(directory: string, rootDocumentId: string): Promise<void> {
  const filePath = getRootDocumentPath(directory)
  const data = { rootDocumentId }

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')

  debug(`Wrote root document ID to ${filePath}`)
}

async function getRootDocumentId(directory: string): Promise<string> {
  const rootDocumentId = await readRootDocumentId(directory)

  if (!rootDocumentId) {
    debug('Root document ID not found, creating new root document')
    const doc = await createRootDocument(directory)
    await writeRootDocumentId(directory, doc.url)
    return doc.url
  }

  return rootDocumentId
}

export interface SyncServerOptions extends SyncServiceOptions {
  directory: string
  serverId: string
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

  // if (typeof options.getDocumentsForUser !== 'function') {
  //   throw new Error('SyncServerOptions.getDocumentsForUser must be a function')
  // }

  if (typeof options.initializeDocument !== 'function') {
    throw new Error('SyncServerOptions.initializeDocument must be a function')
  }

  if (typeof options.getDocumentsForData !== 'function') {
    throw new Error('SyncServerOptions.getDocumentsForData must be a function')
  }

  return true
}

export type AppSetupHookContext = {
  app: Application
  server: HttpServer
}

export function handleWss(options: SyncServerOptions) {
  return async (context: AppSetupHookContext, next: NextFunction) => {
    const { syncServicePath, authenticate, syncServerWsPath = '' } = options
    const wss = new WebSocketServer({ noServer: true })
    const repo = createRepo(options.directory, {
      peerId: options.serverId as PeerId,
      network: [new NodeWSServerAdapter(wss as any)],
      sharePolicy: async () => false
    })
    const rootDocumentId = await getRootDocumentId(options.directory)
    const rootDocument = await repo.find<RootDocument>(rootDocumentId as AnyDocumentId)

    context.app.use(syncServicePath, new AutomergeSyncService(repo, rootDocument, options))
    context.server.on('upgrade', async (request, socket, head) => {
      const url = new URL(request.url!, `http://${request.headers.host}`)
      const pathname = url.pathname
      const accessToken = url.searchParams.get('accessToken')

      if (pathname === `/${syncServerWsPath}`) {
        try {
          const authCheck = await authenticate(context.app, accessToken)
          if (!authCheck) {
            debug('Socket authentication failed')
            socket.destroy()
            return
          }

          wss.handleUpgrade(request, socket, head, (socket: unknown) => {
            debug('Handling sync-server websocket connection')
            wss.emit('connection', socket, request)
          })
        } catch (error: unknown) {
          console.error('Error handling websocket connection:', error)
          socket.destroy()
        }
      }
    })

    await next()
  }
}

export function handleWsClient(options: SyncServerOptions) {
  return async (context: AppSetupHookContext, next: NextFunction) => {
    const { getAccessToken, syncServerUrl, directory, serverId } = options
    const accessToken = typeof getAccessToken === 'function' ? await getAccessToken(context.app) : ''
    const url = `${syncServerUrl}?accessToken=${accessToken}`
    const repo = createRepo(directory, {
      peerId: serverId as PeerId,
      network: [new BrowserWebSocketClientAdapter(url)]
    })
    const rootDocumentId = await getRootDocumentId(directory)
    const rootDocument = await repo.find<RootDocument>(rootDocumentId as AnyDocumentId)

    context.app.use(options.syncServicePath, new AutomergeSyncService(repo, rootDocument, options))

    debug(
      `Connecting to remote sync server ${syncServerUrl} ${accessToken ? 'with access token' : 'without access token'}`
    )

    await next()
  }
}

export function automergeServer(options: SyncServerOptions) {
  return function (app: Application) {
    validateSyncServerOptions(options)

    const syncServerSetup =
      typeof options.syncServerUrl === 'string' ? handleWsClient(options) : handleWss(options)

    debug('Initializing automerge service', options)

    app.hooks({
      setup: [syncServerSetup]
    })
  }
}
