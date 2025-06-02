import { AnyDocumentId, Repo } from "@automerge/automerge-repo"
import { Application, feathers, NextFunction } from "@feathersjs/feathers"
import { AutomergeService, ServiceDataDocument } from 'feathers-automerge'
import { BrowserWebSocketClientAdapter, NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import { WebSocketServer } from "ws";
import os from 'os';
import type { Server as HttpServer } from 'http';

export type SyncServiceSettings = {
  service: string,
  channel: string,
  url: string
}

export type AutomergeApplication = Application<any, { repo: Repo }>

export function initSyncService(sync: SyncServiceSettings, automergeApp: AutomergeApplication, serverApp: Application) {
  const handle = automergeApp.get('repo').find<ServiceDataDocument<any>>(sync.url as AnyDocumentId)
  const automergeService = new AutomergeService<any>(handle)
  
  automergeApp.use(sync.service, automergeService)

  automergeApp.service(sync.service).on('created', data => {
    console.log('Automerge app create', data)
    serverApp.service(sync.service)
      .create(data)
      .catch(e => console.error(e))
  })

  automergeApp.service(sync.service).on('patched', data => {
    const { _id, ...rest } = data
    const id = _id.toString()
    console.log('Automerge app patch', rest)
    serverApp.service(sync.service)
      .patch(id, rest)
      .catch(e => console.error(e))
  })

  automergeApp.service(sync.service).on('removed', data => {
    console.log('Automerge app remove', data)
    const id = data._id.toString()
    serverApp.service(sync.service)
      .remove(id)
      .catch(e => console.error(e))
  })

  serverApp.service(sync.service).on('created', async (data) =>{
    const service = automergeApp.service(sync.service) as unknown as AutomergeService<unknown>
    const doc = await service.handle.doc()
    const id = data._id.toString()

    console.log('Server create', data)

    if (data && doc && !doc[id]) {
      automergeApp.service(sync.service)
        .create(data)
        .catch(e => console.error(e))
    }
  })

  serverApp.service(sync.service).on('patched', async (data) => {
    const service = automergeApp.service(sync.service) as unknown as AutomergeService<unknown>
    const doc = await service.handle.doc()
    const { _id, ...payload } = data
    const id = _id.toString()

    console.log('Server patch', payload)

    if (doc && doc[id]) {
      const docData = doc[id]
      // Check if doc[data._id] is different than data
      const isChanged = Object.keys(payload).some(key => docData[key] !== payload[key])

      if (isChanged) {
        automergeApp.service(sync.service)
          .patch(id, payload)
          .catch(e => console.error(e))
      }
    }
  })

  serverApp.service(sync.service).on('removed', async (data) => {
    const service = automergeApp.service(sync.service) as unknown as AutomergeService<unknown>
    const doc = await service.handle.doc()
    const id = data._id.toString()

    console.log('Server remove', data)

    if (doc && doc[id]) {
      automergeApp.service(sync.service)
        .remove(id)
        .catch(e => console.error(e))
    }
  })
}

export async function createAutomergeApp(app: Application, repo: Repo, syncs: SyncServiceSettings[]) {
  const automergeApp = feathers()

  automergeApp.set('repo', repo)

  syncs.forEach(sync => initSyncService(sync, automergeApp, app))

  await automergeApp.setup()

  return automergeApp
}

export function createRepo(dir: string, wss: WebSocketServer|string, hostname: string = os.hostname()) {
  const networkAdapter = typeof wss === 'string' ? new BrowserWebSocketClientAdapter(wss) : new NodeWSServerAdapter(wss as any)
  const config = {
    network: [networkAdapter],
    storage: new NodeFSStorageAdapter(dir),
    /** @ts-ignore @type {(import("@automerge/automerge-repo").PeerId)}  */
    peerId: `storage-server-${hostname}` as PeerId,
    // Since this is a server, we don't share generously — meaning we only sync documents they already
    // know about and can ask for by ID.
    sharePolicy: async () => false
  };
  
  return new Repo(config)
}

export type AutomergeSyncAppConfig = {
  syncServer: WebSocketServer,
  repo: Repo
}

export function createWss() {
  return new WebSocketServer({ noServer: true })
}

export function automergeSyncServer(wss: WebSocketServer) {
  return (app: Application) => {
    app.hooks({
      setup: [async (context: { server: HttpServer }, next: NextFunction) => {
        context.server.on('upgrade', (request, socket, head) => {
          const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname;

          if (pathname === '/') {
            wss.handleUpgrade(request, socket, head, (socket) => {
              wss.emit('connection', socket, request);
            });
          }
        });

        return next()
      }]
    })
  }
}
