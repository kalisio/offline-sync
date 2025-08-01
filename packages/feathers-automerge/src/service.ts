import type { DocHandle } from '@automerge/automerge-repo'
import type { EventEmitter } from 'node:events'
import sift from 'sift'
import { sorter, getLimit } from '@feathersjs/adapter-commons'
import { Params, PaginationParams } from '@feathersjs/feathers'
import { generateObjectId, generateUUID, SyncServiceDocument } from './utils.js'

export type IdGenerator = () => string

export interface AutomergeServiceOptions {
  path: string
  idField: string
  idGenerator: IdGenerator
  matcher: any
  sorter: typeof sorter
  paginate?: PaginationParams
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
  handle: DocHandle<SyncServiceDocument>
  public options: AutomergeServiceOptions

  constructor(handle: DocHandle<SyncServiceDocument>, options: Partial<AutomergeServiceOptions> = {}) {
    const idField = options.idField ?? 'id'
    const idGenerator = options.idGenerator ?? (idField === '_id' ? generateObjectId : generateUUID)

    this.handle = handle
    this.options = {
      idField,
      idGenerator,
      matcher: sift,
      path: 'data',
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
    const paginate = params.paginate !== undefined ? params.paginate : this.options.paginate
    let { $skip, $limit, $sort, ...query } = params.query ?? {}
    $limit = getLimit($limit, this.options.paginate)

    let values = Object.values(doc[this.options.path] || {}) as T[]
    const hasQuery = Object.keys(query).length > 0

    if ($sort) {
      values.sort(this.options.sorter($sort))
    }

    if (hasQuery) {
      values = values.filter(this.options.matcher(query))
    }

    if (paginate !== false) {
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

    if (doc == null || !doc[this.options.path][id]) {
      throw new Error(`Item ${id} not found`)
    }

    return doc[this.options.path][id] as T
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
      doc[this.options.path][id] = item
    })

    return item
  }

  async patch(id: string, data: Partial<T>) {
    return new Promise<T>((resolve) =>
      this.handle.change((doc) => {
        Object.keys(data).forEach((_prop) => {
          const prop = _prop as keyof T
          const item = doc[this.options.path][id] as any

          item[prop] = data[prop]
        })

        resolve(doc[this.options.path][id] as T)
      })
    )
  }

  async remove(id: string) {
    const doc = await this.handle.doc()

    if (doc == null || !doc[this.options.path][id]) {
      throw new Error(`Item ${id} not found`)
    }

    const removed = doc[this.options.path][id]

    this.handle.change((doc) => {
      delete doc[this.options.path][id]
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
        patches
          .map((patch) => (patch.path[0] === this.options.path ? patch.path[1] : null))
          .filter((id) => id != null)
      )

      const { path } = this.options

      for (const id of ids) {
        if (!before[path] || !before[path][id]) {
          emitter.emit('created', after[path][id])
        } else if (!after[path][id]) {
          emitter.emit('removed', before[path][id])
        } else if (before[path] && before[path][id]) {
          emitter.emit('patched', after[path][id])
        }
      }
    })
  }
}
