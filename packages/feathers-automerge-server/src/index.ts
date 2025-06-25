import { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { Application, NextFunction } from '@feathersjs/feathers'
import { AutomergeService, ServiceDataDocument } from '@kalisio/feathers-automerge'
import {
  BrowserWebSocketClientAdapter,
  NodeWSServerAdapter
} from '@automerge/automerge-repo-network-websocket'
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs'
import { WebSocketServer } from 'ws'
import os from 'os'
import type { Server as HttpServer } from 'http'
import { SyncServiceSettings, createAutomergeApp } from './automerge.js'

export * from './automerge.js'

const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`
const red = (text: string) => `\x1b[31m${text}\x1b[0m`

export function createRepo(dir: string, wss: WebSocketServer | string, hostname: string = os.hostname()) {
  if (typeof wss === 'string') {
    return new Repo({
      network: [new BrowserWebSocketClientAdapter(wss)],
      storage: new NodeFSStorageAdapter(dir)
    })
  }

  return new Repo({
    network: [new NodeWSServerAdapter(wss as any)],
    storage: new NodeFSStorageAdapter(dir),
    /** @ts-expect-error @type {(import("@automerge/automerge-repo").PeerId)}  */
    peerId: `storage-server-${hostname}` as PeerId,
    // Since this is a server, we don't share generously — meaning we only sync documents they already
    // know about and can ask for by ID.
    sharePolicy: async () => false
  })
}

export function createWss() {
  return new WebSocketServer({ noServer: true })
}

export interface ServerOptions {
  syncServerUrl?: string
  directory: string
  document?: string
  services: string[]
}

export function automergeServer() {
  return function (app: Application) {
    const options = app.get('automerge') as ServerOptions

    if (!options) {
      throw new Error('automerge configuration must be set')
    }

    console.log('Automerge server configuration is', options)

    let repo

    if (options.syncServerUrl) {
      // If we are connecting to another sync server, only create the repository
      repo = createRepo(options.directory, options.syncServerUrl)
    } else {
      const wss = createWss()
      repo = createRepo(options.directory, wss)

      app.hooks({
        setup: [
          async (context: { server: HttpServer }, next: NextFunction) => {
            context.server.on('upgrade', (request, socket, head) => {
              const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname

              if (pathname === '/') {
                wss.handleUpgrade(request, socket, head, (socket) => {
                  wss.emit('connection', socket, request)
                })
              }
            })

            return await next()
          }
        ]
      })
    }

    let mainDoc: DocHandle<ServiceDataDocument<SyncServiceSettings>>

    if (options.document) {
      mainDoc = repo.find<ServiceDataDocument<SyncServiceSettings>>(options.document as AnyDocumentId)
      console.log(`Using existing document ${mainDoc.url}`)
    } else {
      mainDoc = repo.create<ServiceDataDocument<SyncServiceSettings>>({
        service: 'automerge',
        data: {}
      })
      console.log(
        `\n\n${yellow('NOTE:')} Created new Automerge document ${mainDoc.url}. Please update your automerge.document configuration or AUTOMERGE_DOCUMENT environment variable accordingly.\n\n`
      )
    }

    app.use(
      // offline-directory
      'automerge',
      new AutomergeService(mainDoc, {
        idField: 'url'
      })
    )

    const automergeService = app.service('automerge')

    if (!options.document) {
      const syncs = options.services.map((service) => {
        const doc = repo.create({
          service,
          data: {}
        })
        const url = doc.url

        return {
          url,
          idField: '_id',
          service
        }
      })
      syncs.forEach(async (sync) => await automergeService.create(sync))
      createAutomergeApp(app, repo, syncs)
    } else {
      automergeService.find().then((page) => {
        const syncs = page.data

        createAutomergeApp(app, repo, syncs)
      })
    }

    mainDoc.on('unavailable', () => {
      if (mainDoc) {
        console.error(
          `\n\n${red('ERROR:')} Automerge main document ${mainDoc.url} is not available on the local file system. Try removing the automerge.document configuration to intialize a new document and updating the configuration with the new URL.\n\n`
        )
      }
    })
  }
}
