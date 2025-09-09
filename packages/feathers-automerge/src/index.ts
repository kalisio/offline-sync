import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import { Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { Application, NextFunction } from '@feathersjs/feathers'
import { AutomergeService, IdGenerator } from './service.js'
import { Query, SyncServiceCreate, SyncServiceDocument, SyncServiceInfo } from './utils.js'

export * from './service.js'
export * from './utils.js'

export const LOCALSTORAGE_KEY = 'feathers-automerge'

export type SyncDocumentHandle = DocHandle<SyncServiceDocument>

export type AutomergeClientOptions = {
  syncServerUrl: string
  syncServicePath: string
  authentication: boolean
  repo?: Repo
}

export type AutomergeAppConfig = {
  repo: Repo
  syncOptions: AutomergeClientOptions
  syncHandle: Promise<SyncDocumentHandle> | null
}

export function createBrowserRepo(wsUrl: string) {
  return new Repo({
    network: [new BrowserWebSocketClientAdapter(wsUrl)],
    storage: new IndexedDBStorageAdapter()
  })
}

export async function getDocHandle(app: Application, url: AutomergeUrl): Promise<SyncDocumentHandle> {
  const repo: Repo = app.get('repo')

  if (!repo) {
    throw new Error('Repo not initialized on application')
  }

  return repo.find<SyncServiceDocument>(url)
}

export async function initAutomergeServices(app: Application, url: AutomergeUrl) {
  app.set('syncHandle', getDocHandle(app, url))

  const handle: SyncDocumentHandle = await app.get('syncHandle')
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

export async function syncOffline(app: Application, payload: SyncServiceCreate) {
  const { syncServicePath } = app.get('syncOptions') as AutomergeClientOptions
  const info: SyncServiceInfo = await app.service(syncServicePath).create(payload)

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(LOCALSTORAGE_KEY, info.url)
  }

  await initAutomergeServices(app, info.url)

  return info
}

export async function stopSyncOffline(app: Application) {
  const handle: SyncDocumentHandle = await app.get('syncHandle')

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

  app.set('syncHandle', null)

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(LOCALSTORAGE_KEY)
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
        await initAutomergeServices(app, url as AutomergeUrl)
      }
    }
  }

  return function (app: Application) {
    app.set('syncOptions', options)
    app.set('syncHandle', null)

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
