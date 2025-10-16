import { PeerId, Repo, RepoConfig } from '@automerge/automerge-repo'
import { Application, NextFunction } from '@feathersjs/feathers'
import {
  BrowserWebSocketClientAdapter,
  NodeWSServerAdapter
} from '@automerge/automerge-repo-network-websocket'
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs'
import { WebSocketServer } from 'ws'
import type { Server as HttpServer } from 'http'
import { AutomergeSyncService, SyncServiceOptions } from './sync-service.js'
import createDebug from 'debug'

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

export interface SyncServerOptions extends SyncServiceOptions {
  directory: string
  serverId: string
  authenticate: (app: Application, accessToken: string | null) => Promise<boolean>
  getAccessToken?: (app: Application) => Promise<string>
  syncDocumentUrl?: string
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

  if (typeof options.rootDocumentId !== 'string' || options.rootDocumentId.trim() === '') {
    throw new Error('SyncServerOptions.rootDocumentId must be a non-empty string')
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

    context.app.use(syncServicePath, new AutomergeSyncService(repo, options))
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
    const { getAccessToken, syncDocumentUrl, directory, serverId } = options

    if (!syncDocumentUrl) {
      throw new Error('syncDocumentUrl is required for client mode')
    }

    const urlParts = syncDocumentUrl.split('/automerge/')
    if (urlParts.length !== 2) {
      throw new Error('syncDocumentUrl must be in format: https://server.com/automerge/automerge:documentId')
    }

    const [syncServerUrl, documentUrl] = urlParts
    const accessToken = typeof getAccessToken === 'function' ? await getAccessToken(context.app) : ''
    const url = `${syncServerUrl}?accessToken=${accessToken}`
    const repo = createRepo(directory, {
      peerId: serverId as PeerId,
      network: [new BrowserWebSocketClientAdapter(url)]
    })

    const serviceOptions = {
      ...options,
      syncDocumentUrl: documentUrl
    }

    context.app.use(options.syncServicePath, new AutomergeSyncService(repo, serviceOptions))

    debug(
      `Connecting to remote sync server ${syncServerUrl} for document ${documentUrl} ${accessToken ? 'with access token' : 'without access token'}`
    )

    await next()
  }
}

export function automergeServer(options: SyncServerOptions) {
  return function (app: Application) {
    validateSyncServerOptions(options)

    const syncServerSetup =
      typeof options.syncDocumentUrl === 'string' ? handleWsClient(options) : handleWss(options)

    debug('Initializing automerge service', options)

    app.hooks({
      setup: [syncServerSetup]
    })
  }
}
