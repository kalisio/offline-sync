import type { AnyDocumentId, DocHandle } from '@automerge/automerge-repo'
import { Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { sorter } from '@feathersjs/adapter-commons'
import { Application, NextFunction, Params } from '@feathersjs/feathers'
import type { EventEmitter } from 'node:events'
import sift from 'sift'

export interface ServiceDataDocument<T> {
  service: string
  data: {
    [key: string]: T
  }
}

export type IdGenerator = () => string

export interface AutomergeServiceOptions {
  idField: string
  idGenerator: IdGenerator
  matcher: any
  sorter: typeof sorter
}

// MongoDB ObjectId-like generator
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0')
  const machineId = Math.floor(Math.random() * 16777216)
    .toString(16)
    .padStart(6, '0')
  const processId = Math.floor(Math.random() * 65536)
    .toString(16)
    .padStart(4, '0')
  const counter = Math.floor(Math.random() * 16777216)
    .toString(16)
    .padStart(6, '0')

  return timestamp + machineId + processId + counter
}

// UUID generator (wrapper around crypto.randomUUID)
export function generateUUID(): string {
  return crypto.randomUUID()
}

export interface Paginated<T> {
  total: number
  limit: number
  skip: number
  data: T[]
}

export type FindParams = Params<Record<string, any>>

export class AutomergeService<T, C = T> {
  events = ['created', 'patched', 'removed']
  handle: DocHandle<ServiceDataDocument<T>>
  public options: AutomergeServiceOptions

  constructor(handle: DocHandle<ServiceDataDocument<T>>, options: Partial<AutomergeServiceOptions> = {}) {
    this.handle = handle
    this.options = {
      idField: options.idField ?? 'id',
      idGenerator: options.idGenerator ?? generateUUID,
      matcher: sift,
      sorter,
      ...options
    }
  }

  get idField() {
    return this.options.idField
  }

  get idGenerator() {
    return this.options.idGenerator
  }

  async find(params: FindParams & { paginate: false }): Promise<T[]>
  async find(params: FindParams & { paginate?: true }): Promise<Paginated<T>>
  async find(params: FindParams & { paginate?: boolean }): Promise<T[] | Paginated<T>> {
    const doc = await this.handle.doc()

    if (!doc) {
      throw new Error('Document not loaded')
    }

    const { $skip = 0, $limit = 10, $sort, ...query } = params.query ?? {}

    let values = Object.values(doc.data || {})
    const hasQuery = Object.keys(query).length > 0

    if ($sort) {
      values.sort(this.options.sorter($sort))
    }

    if (hasQuery) {
      values = values.filter(this.options.matcher(query))
    }

    if (params.paginate !== false) {
      const total = values.length

      values = values.slice($skip)
      values = values.slice(0, $limit)

      const result = {
        total,
        limit: $limit,
        skip: $skip || 0,
        data: values
      }

      return result
    }

    return values
  }

  async get(id: string) {
    const doc = await this.handle.doc()

    if (doc == null || !doc.data[id]) {
      throw new Error(`Item ${id} not found`)
    }

    return doc.data[id]
  }

  async create(data: C) {
    const id = (data as any)[this.idField]?.toString() || this.idGenerator()
    const item = JSON.parse(
      JSON.stringify({
        [this.idField]: id,
        ...data
      })
    ) as T

    this.handle.change((doc) => {
      doc.data[id] = item
    })

    return item
  }

  async patch(id: string, data: Partial<T>) {
    const item = await this.get(id)
    const patched = JSON.parse(
      JSON.stringify({
        ...item,
        ...data
      })
    )

    this.handle.change((doc) => {
      doc.data[id] = patched
    })

    return patched
  }

  async remove(id: string) {
    const doc = await this.handle.doc()

    if (doc == null || !doc.data[id]) {
      throw new Error(`Item ${id} not found`)
    }

    const removed = doc.data[id]

    this.handle.change((doc) => {
      delete doc.data[id]
    })

    return removed
  }

  async setup() {
    this.handle.on('change', ({ patches, patchInfo }) => {
      const { before, after } = patchInfo
      const emitter = this as unknown as EventEmitter

      if (typeof emitter.emit !== 'function') {
        return
      }

      const ids = new Set(
        patches.map((patch) => (patch.path[0] === 'data' ? patch.path[1] : null)).filter((id) => id != null)
      )

      for (const id of ids) {
        if (!before.data || !before.data[id]) {
          emitter.emit('created', after.data[id])
        } else if (!after.data[id]) {
          emitter.emit('removed', before.data[id])
        } else if (before.data && before.data[id]) {
          emitter.emit('patched', after.data[id])
        }
      }
    })
  }
}

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
