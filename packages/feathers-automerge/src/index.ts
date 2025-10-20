import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import { Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { Application, NextFunction } from '@feathersjs/feathers'
import { Query, SyncServiceCreate, SyncServiceDocument, SyncServiceInfo } from './utils.js'
import { serviceWrapper } from './wrapper.js'

export * from './service.js'
export * from './utils.js'
export * from './wrapper.js'

export const LOCALSTORAGE_KEY = 'feathers-automerge'

export type SyncDocumentHandle = DocHandle<SyncServiceDocument>

export type AutomergeClientOptions = {
  syncServerUrl: string
  syncServicePath: string
  authentication: boolean
  repo?: Repo
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

export async function syncOffline(app: AutomergeClientApp, payload: SyncServiceCreate) {
  const { syncServicePath } = app.get('syncOptions')
  const info: SyncServiceInfo = await app.service(syncServicePath).create(payload)

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(LOCALSTORAGE_KEY, info.url)
  }

  app.set('syncHandle', getDocHandle(app, info.url))

  return info
}

export async function stopSyncOffline(app: AutomergeClientApp, remove = false) {
  const handle = await app.get('syncHandle')

  if (!handle) {
    return
  }

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
  const setupClient = async (app: Application, query: Query = {}) => {
    const queryString = new URLSearchParams(query).toString()
    const serverUrl = `${options.syncServerUrl}?${queryString}`
    const repo = options.repo ?? createBrowserRepo(serverUrl)

    app.set('repo', repo)

    if (typeof window !== 'undefined' && window.localStorage) {
      const url = window.localStorage.getItem(LOCALSTORAGE_KEY)

      if (url) {
        app.set('syncHandle', getDocHandle(app, url as AutomergeUrl))
      }
    }
  }

  return function (app: Application) {
    app.set('syncOptions', options)
    app.set('syncHandle', null)
    app.configure(serviceWrapper)

    if (options.authentication) {
      app.on('login', (authResult) => {
        const { accessToken } = authResult
        setupClient(app, { accessToken })
      })
    } else {
      app.hooks({
        setup: [
          async (_context: unknown, next: NextFunction) => {
            await setupClient(app)
            await next()
          }
        ]
      })
    }
  }
}
