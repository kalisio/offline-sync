import { NetworkAdapterInterface, PeerId, Repo, RepoConfig } from '@automerge/automerge-repo'
import { Application, NextFunction } from '@feathersjs/feathers'
import {
  BrowserWebSocketClientAdapter,
  NodeWSServerAdapter
} from '@automerge/automerge-repo-network-websocket'
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs'
import { WebSocketServer } from 'ws'
import os from 'os'
import type { Server as HttpServer } from 'http'
import { AutomergeSyncServive, SyncServiceOptions } from './sync-service.js'
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
  authenticate?: (app: Application, accessToken: string | null) => Promise<boolean>
  getAccessToken?: (app: Application) => Promise<string>
  syncServerUrl?: string
  syncServerWsPath?: string
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

    context.app.use(syncServicePath, new AutomergeSyncServive(repo, options))
    context.server.on('upgrade', async (request, socket, head) => {
      const url = new URL(request.url!, `http://${request.headers.host}`)
      const pathname = url.pathname
      const accessToken = url.searchParams.get('accessToken')

      if (pathname === `/${syncServerWsPath}`) {
        try {
          if (authenticate && !(await authenticate(context.app, accessToken))) {
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

    context.app.use(options.syncServicePath, new AutomergeSyncServive(repo, options))

    debug(
      `Connecting to remote sync server ${syncServerUrl} ${accessToken ? 'with access token' : 'without access token'}`
    )

    await next()
  }
}

export function automergeServer(options: SyncServerOptions) {
  return function (app: Application) {
    if (!options) {
      throw new Error('automerge configuration must be set')
    }

    const syncServerSetup =
      typeof options.syncServerUrl === 'string' ? handleWsClient(options) : handleWss(options)

    debug('Initializing automerge service', options)

    app.hooks({
      setup: [syncServerSetup]
    })
  }
}
