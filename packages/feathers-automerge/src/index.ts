import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import { Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { Application, NextFunction } from '@feathersjs/feathers'
import { AutomergeService, IdGenerator } from './service.js'
import { SyncServiceCreate, SyncServiceDocument, SyncServiceInfo } from './utils.js'

export * from './service.js'
export * from './utils.js'

export const LOCALSTORAGE_KEY = 'feathers-automerge'

export type SyncDocumentHandle = DocHandle<SyncServiceDocument>

export type AutomergeClientOptions = {
  syncServerUrl: string
  syncServicePath: string
  repo?: Repo
}

export type AutomergeAppConfig = {
  repo: Repo
  syncOptions: AutomergeClientOptions
  syncHandle: Promise<SyncDocumentHandle> | null
}

export type AutomergeClientConfig = {
  syncOptions: AutomergeClientOptions
  syncHandle: Promise<SyncDocumentHandle> | null
  repo: Repo
}

export type AutomergeClientApp = Application<any, AutomergeClientConfig>

export function createBrowserRepo(wsUrl: string) {
  return new Repo({
    network: [new BrowserWebSocketClientAdapter(wsUrl)],
    storage: new IndexedDBStorageAdapter()
  })
}

export async function getDocHandle(app: AutomergeClientApp, url: AutomergeUrl): Promise<SyncDocumentHandle> {
  const repo = app.get('repo')

  if (!repo) {
    throw new Error('Repo not initialized on application')
  }

  return repo.find<SyncServiceDocument>(url)
}

export async function initAutomergeServices(app: AutomergeClientApp, url: AutomergeUrl) {
  app.set('syncHandle', getDocHandle(app, url))

  const handle = await app.get('syncHandle')!
  const doc = await handle.doc()

  Object.keys(doc).forEach((path) => {
    if (path !== '__meta') {
      const { idField, paginate } = doc.__meta[path]

      app.use(
        path,
        new AutomergeService(handle, {
          idField,
          paginate,
          path
        })
      )
    }
  })
}

export async function syncOffline(app: AutomergeClientApp, payload: SyncServiceCreate) {
  const { syncServicePath } = app.get('syncOptions')
  const info: SyncServiceInfo = await app.service(syncServicePath).create(payload)

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(LOCALSTORAGE_KEY, info.url)
  }

  await initAutomergeServices(app, info.url)

  return info
}

export async function stopSyncOffline(app: AutomergeClientApp, remove = false) {
  const handle = await app.get('syncHandle')

  if (!handle) {
    return
  }

  const doc = await handle.doc()

  await Promise.all(
    Object.keys(doc).map(async (path) => {
      if (path !== '__meta') {
        await app.unuse(path)
      }
    })
  )

  app.get('repo').delete(handle.documentId)
  app.set('syncHandle', null)

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(LOCALSTORAGE_KEY)
  }

  if (remove) {
    await app.service('automerge').remove(handle.documentId)
  }
}

export function automergeClient(options: AutomergeClientOptions) {
  return function (app: AutomergeClientApp) {
    const repo = options.repo ?? createBrowserRepo(options.syncServerUrl)

    app.set('syncOptions', options)
    app.set('syncHandle', null)
    app.set('repo', repo)

    app.hooks({
      setup: [
        async (_context: unknown, next: NextFunction) => {
          if (typeof window !== 'undefined' && window.localStorage) {
            const url = window.localStorage.getItem(LOCALSTORAGE_KEY)

            if (url) {
              await initAutomergeServices(app, url as AutomergeUrl)
            }
          }

          await next()
        }
      ]
    })
  }
}
