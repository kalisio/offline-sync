import type { AnyDocumentId } from '@automerge/automerge-repo'
import { Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { Application, NextFunction } from '@feathersjs/feathers'
import { AutomergeService, type ServiceDataDocument } from './service.js'
import { generateObjectId, SyncServiceInfo } from './utils.js'

export * from './service.js'
export * from './utils.js'

export function createBrowserRepo(wsUrl: string) {
  return new Repo({
    network: [new BrowserWebSocketClientAdapter(wsUrl)],
    storage: new IndexedDBStorageAdapter()
  })
}

export function getDocumentHandle<T>(repo: Repo, docId?: AnyDocumentId) {
  if (docId != null) {
    return repo.find<ServiceDataDocument<T>>(docId)
  }

  return repo.create<ServiceDataDocument<T>>()
}

export async function syncOffline(app: Application, options: any) {
  const repo: Repo = app.get('repo')

  if (!repo) {
    throw new Error('Repo not initialized on application')
  }

  const info: SyncServiceInfo = await app.service('automerge').create(options)

  // const handle = await repo.find(info.url)
  // const data = handle.doc()

  return info
}

export async function stopSyncOffline(app: Application) {}

export function automergeClient(syncServerUrl: string) {
  return function (app: Application) {
    const repo = createBrowserRepo(syncServerUrl)

    app.set('repo', repo)

    app.hooks({
      setup: [
        async (_context: unknown, next: NextFunction) => {
          const { data: syncs } = await app.service('automerge').find()

          for (const sync of syncs) {
            console.log('Registering automerge service', sync)
            const handle = await repo.find<ServiceDataDocument<unknown>>(sync.url)
            const automergeService = new AutomergeService<unknown>(handle, {
              idField: sync.idField,
              idGenerator: generateObjectId
            })
            app.use(sync.service, automergeService)
          }

          await next()
        }
      ]
    })
  }
}
