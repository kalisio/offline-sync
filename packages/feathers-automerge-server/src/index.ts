import { PeerId, Repo } from '@automerge/automerge-repo'
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

export function createRepo(
  dir: string,
  wss?: WebSocketServer | string,
  peerId: string = `storage-server-${os.hostname()}`
) {
  if (!wss) {
    return new Repo({
      network: [],
      storage: new NodeFSStorageAdapter(dir)
    })
  }

  if (typeof wss === 'string') {
    return new Repo({
      network: [new BrowserWebSocketClientAdapter(wss)],
      storage: new NodeFSStorageAdapter(dir)
    })
  }

  return new Repo({
    network: [new NodeWSServerAdapter(wss as any)],
    storage: new NodeFSStorageAdapter(dir),
    peerId: peerId as PeerId,
    // Since this is a server, we don't share generously — meaning we only sync documents they already
    // know about and can ask for by ID.
    sharePolicy: async () => false
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

export function createWss() {
  return new WebSocketServer({ noServer: true })
}

export interface ServerOptions extends SyncServiceOptions {
  syncServerUrl?: string
  directory: string
}

export function handleWss(wss: WebSocketServer) {
  return async (context: { server: HttpServer }, next: NextFunction) => {
    context.server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname

      if (pathname === '/') {
        wss.handleUpgrade(request, socket, head, (socket) => {
          debug('Handling sync-server websocket connection')
          wss.emit('connection', socket, request)
        })
      }
    })

    return next()
  }
}

export function automergeServer(options: ServerOptions) {
  return function (app: Application) {
    if (!options) {
      throw new Error('automerge configuration must be set')
    }

    const wss = options.syncServerUrl ? options.syncServerUrl : createWss()
    const repo = createRepo(options.directory, wss, options.serverId)

    debug('Initializing automerge service', options)

    if (wss instanceof WebSocketServer) {
      app.hooks({
        setup: [handleWss(wss)]
      })
    }

    app.use(options.syncServicePath, new AutomergeSyncServive(repo, options))
  }
}
