import { AnyDocumentId, PeerId } from '@automerge/automerge-repo'
import type { NextFunction } from '@feathersjs/feathers'
import type { Application } from '@feathersjs/express'
import {
  BrowserWebSocketClientAdapter,
  NodeWSServerAdapter
} from '@automerge/automerge-repo-network-websocket'
import { WebSocketServer } from 'ws'
import type { Server as HttpServer } from 'http'
import { AutomergeSyncService, SyncServiceOptions, type RootDocument } from './sync-service.js'
import createDebug from 'debug'
import { SyncServiceInfo } from '@kalisio/feathers-automerge'
import { createRepo, getRootDocumentId } from './utils.js'

export * from './utils.js'

const debug = createDebug('feathers-automerge-server')

export type AppSetupHookContext = {
  app: Application
  server: HttpServer
}

export interface SyncOptionsBase extends SyncServiceOptions {
  directory: string
  serverId: string
  syncServicePath: string
}

export interface SyncServerOptions extends SyncOptionsBase {
  authenticate: (app: Application, accessToken: string | null) => Promise<boolean>
  syncServerWsPath?: string
}

export interface SyncClientOptions extends SyncOptionsBase {
  getAccessToken?: (app: Application) => Promise<string>
  syncServerUrl?: string
}

export type SyncOptions = SyncServerOptions & SyncClientOptions

export function validateSyncServerOptions(options: SyncOptions): options is SyncServerOptions {
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

export function handleWss(options: SyncServerOptions) {
  return async (context: AppSetupHookContext, next: NextFunction) => {
    const { syncServicePath, authenticate, syncServerWsPath = '' } = options
    const wss = new WebSocketServer({ noServer: true })
    const repo = createRepo(options.directory, {
      peerId: options.serverId as PeerId,
      network: [new NodeWSServerAdapter(wss as any)],
      sharePolicy: async () => false
    })
    const rootDocumentId = await getRootDocumentId(options.directory, async () => {
      return { documents: [] }
    })
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

export function handleWsClient(options: SyncClientOptions) {
  return async (context: AppSetupHookContext, next: NextFunction) => {
    const { getAccessToken, syncServerUrl, directory, serverId, syncServicePath } = options
    const accessToken = typeof getAccessToken === 'function' ? await getAccessToken(context.app) : ''
    const url = `${syncServerUrl}?accessToken=${accessToken}`
    const repo = createRepo(directory, {
      peerId: serverId as PeerId,
      network: [new BrowserWebSocketClientAdapter(url)]
    })
    const rootDocumentId = await getRootDocumentId(directory, async () => {
      const res = await fetch(`${syncServerUrl}${syncServicePath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          query: {}
        })
      })
      const info: SyncServiceInfo = await res.json()

      return {
        documents: [info]
      }
    })
    const rootDocument = await repo.find<RootDocument>(rootDocumentId as AnyDocumentId)

    context.app.use(syncServicePath, new AutomergeSyncService(repo, rootDocument, options))

    debug(
      `Connecting to remote sync server ${syncServerUrl} ${accessToken ? 'with access token' : 'without access token'}`
    )

    await next()
  }
}

export function automergeServer(options: SyncOptions) {
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
