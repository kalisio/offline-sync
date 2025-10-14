import type { DocHandle, UrlHeads } from '@automerge/automerge-repo'
import type { EventEmitter } from 'node:events'
import sift from 'sift'
import { sorter, getLimit, select } from '@feathersjs/adapter-commons'
import { Params, PaginationParams, Id } from '@feathersjs/feathers'
import { generateObjectId, generateUUID, SyncServiceDocument } from './utils.js'
import { NotFound, MethodNotAllowed } from '@feathersjs/errors'

export type IdGenerator = () => string

export interface AutomergeServiceOptions {
  path: string
  idField: string
  idGenerator: IdGenerator
  matcher: any
  sorter: typeof sorter
  paginate?: PaginationParams
  multi?: boolean | string[]
}

export interface Paginated<T> {
  total: number
  limit: number
  skip: number
  data: T[]
}

export type FindParams = Params<Record<string, any>>

export const CHANGE_ID = '__change'

export class AutomergeService<T, C = T> {
  events = ['created', 'patched', 'removed']
  handle: DocHandle<SyncServiceDocument>
  docHeads: unknown[] = []
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

  get id() {
    return this.options.idField
  }

  get idGenerator() {
    return this.options.idGenerator
  }

  getOptions(params: Params = {}) {
    return {
      ...this.options,
      ...(params as any).adapter
    }
  }

  allowsMulti(method: string, params: Params = {}) {
    const alwaysMulti: { [key: string]: boolean } = {
      find: true,
      get: false,
      update: false
    }
    const always = alwaysMulti[method]

    if (typeof always !== 'undefined') {
      return always
    }

    const { multi } = this.getOptions(params)

    if (multi === true || !multi) {
      return multi
    }

    return multi.includes(method)
  }

  async find(params?: FindParams & { paginate: false }): Promise<T[]>
  async find(params?: FindParams & { paginate?: true }): Promise<Paginated<T>>
  async find(params: FindParams & { paginate?: boolean } = {}): Promise<T[] | Paginated<T>> {
    const doc = this.handle.doc()

    if (!doc) {
      throw new NotFound('Document not loaded')
    }

    const options = this.getOptions(params)
    const paginate = params?.paginate !== undefined ? params.paginate : options.paginate
    let { $skip, $limit, $sort, $select, ...query } = params?.query ?? {}

    let values = Object.values(doc[this.options.path] || {}) as T[]
    const hasQuery = Object.keys(query).length > 0

    if ($sort) {
      values.sort(this.options.sorter($sort))
    }

    if (hasQuery) {
      values = values.filter(this.options.matcher(query))
    }

    const shouldPaginate = paginate === true || (paginate !== false && options.paginate)

    if (shouldPaginate) {
      const total = values.length
      const paginateOptions = typeof paginate === 'object' ? paginate : options.paginate
      const finalLimit = getLimit($limit, paginateOptions)

      values = values.slice($skip)
      values = values.slice(0, finalLimit)

      const result = {
        total,
        limit: finalLimit,
        skip: $skip || 0,
        data: values.map((item) => select(params, this.id)(item))
      }

      return result
    }

    // Apply $limit and $skip even when not paginated
    if ($skip) {
      values = values.slice($skip)
    }
    if ($limit !== undefined) {
      values = values.slice(0, $limit)
    }

    return values.map((item) => select(params, this.id)(item))
  }

  async get(id: Id, params: Params = {}) {
    const doc = this.handle.doc()

    if (doc == null || !doc[this.options.path][id]) {
      throw new NotFound(`Item ${id} not found`)
    }

    const result = doc[this.options.path][id] as T

    // Check if item matches query filters (excluding special operators like $select)
    const { $select, ...query } = params?.query ?? {}
    const hasQuery = Object.keys(query).length > 0

    if (hasQuery) {
      const matches = this.options.matcher(query)
      if (!matches(result)) {
        throw new NotFound(`Item ${id} not found`)
      }
    }

    return select(params, this.id)(result)
  }

  async create(data: C, params?: Params): Promise<T>
  async create(data: C[], params?: Params): Promise<T[]>
  async create(data: C | C[], params: Params = {}): Promise<T | T[]> {
    // Multi-create when data is an array
    if (Array.isArray(data)) {
      if (!this.allowsMulti('create', params)) {
        throw new MethodNotAllowed('Can not create multiple entries')
      }
      const items = data.map((item) => {
        const id = (item as any)[this.id]?.toString() || this.idGenerator()
        return JSON.parse(
          JSON.stringify({
            [this.id]: id,
            [CHANGE_ID]: generateUUID(),
            ...item
          })
        )
      })

      this.handle.change((doc) => {
        items.forEach((item) => {
          doc[this.options.path][item[this.id]] = item
        })
      })

      return items.map((item) => select(params, this.id)(item)) as T[]
    }

    // Single create
    const id = (data as any)[this.id]?.toString() || this.idGenerator()
    const item = JSON.parse(
      JSON.stringify({
        [this.id]: id,
        [CHANGE_ID]: generateUUID(),
        ...data
      })
    )

    this.handle.change((doc) => {
      doc[this.options.path][id] = item
    })

    return select(params, this.id)(item) as T
  }

  async update(id: Id, data: C, params: Params = {}) {
    const doc = this.handle.doc()

    if (doc == null || !doc[this.options.path][id]) {
      throw new NotFound(`Item ${id} not found`)
    }

    const existingItem = doc[this.options.path][id] as T

    // Check if item matches query filters (excluding special operators like $select)
    const { $select, ...query } = params?.query ?? {}
    const hasQuery = Object.keys(query).length > 0

    if (hasQuery) {
      const matches = this.options.matcher(query)
      if (!matches(existingItem)) {
        throw new NotFound(`Item ${id} not found`)
      }
    }

    const item = JSON.parse(
      JSON.stringify({
        [this.id]: id,
        [CHANGE_ID]: generateUUID(),
        ...data
      })
    )

    this.handle.change((doc) => {
      doc[this.options.path][id] = item
    })

    return select(params, this.id)(item as T)
  }

  async patch(id: Id, data: Partial<T>, params?: Params): Promise<T>
  async patch(id: null, data: Partial<T>, params?: Params): Promise<T[]>
  async patch(id: Id | null, data: Partial<T>, params: Params = {}): Promise<T | T[]> {
    const doc = this.handle.doc()

    if (doc == null) {
      throw new NotFound('Document not loaded')
    }

    // Multi-patch when id is null
    if (id === null) {
      if (!this.allowsMulti('patch', params)) {
        throw new MethodNotAllowed('Can not patch multiple entries')
      }

      const { $select, ...query } = params?.query ?? {}
      let values = Object.values(doc[this.options.path] || {}) as T[]
      const hasQuery = Object.keys(query).length > 0

      if (hasQuery) {
        values = values.filter(this.options.matcher(query))
      }

      const itemIds = values.map((item: any) => item[this.id])
      const { path } = this.options

      return new Promise<T[]>((resolve) =>
        this.handle.change((doc) => {
          const results: T[] = []

          itemIds.forEach((itemId) => {
            const item = doc[path][itemId] as any

            Object.keys(data).forEach((_prop) => {
              const prop = _prop as keyof T
              item[prop] = data[prop]
            })
            item[CHANGE_ID] = generateUUID()

            results.push(select(params, this.id)(doc[path][itemId] as T))
          })

          resolve(results)
        })
      )
    }

    // Single patch
    if (!doc[this.options.path][id]) {
      throw new NotFound(`Item ${id} not found`)
    }

    const existingItem = doc[this.options.path][id] as T

    // Check if item matches query filters (excluding special operators like $select)
    const { $select, ...query } = params?.query ?? {}
    const hasQuery = Object.keys(query).length > 0

    if (hasQuery) {
      const matches = this.options.matcher(query)
      if (!matches(existingItem)) {
        throw new NotFound(`Item ${id} not found`)
      }
    }

    const { path } = this.options

    return new Promise<T>((resolve) =>
      this.handle.change((doc) => {
        const item = doc[path][id] as any

        Object.keys(data).forEach((_prop) => {
          const prop = _prop as keyof T

          item[prop] = data[prop]
        })
        item[CHANGE_ID] = generateUUID()

        resolve(select(params, this.id)(doc[path][id] as T))
      })
    )
  }

  async remove(id: Id, params?: Params): Promise<T>
  async remove(id: null, params?: Params): Promise<T[]>
  async remove(id: Id | null, params: Params = {}): Promise<T | T[]> {
    const doc = this.handle.doc()

    if (doc == null) {
      throw new NotFound('Document not loaded')
    }

    // Multi-remove when id is null
    if (id === null) {
      if (!this.allowsMulti('remove', params)) {
        throw new MethodNotAllowed('Can not remove multiple entries')
      }

      const { query = {} } = params ?? {}
      let values = Object.values(doc[this.options.path] || {}) as T[]
      const hasQuery = Object.keys(query).length > 0

      if (hasQuery) {
        values = values.filter(this.options.matcher(query))
      }

      const idsToRemove = values.map((item: any) => item[this.id])

      this.handle.change((doc) => {
        idsToRemove.forEach((itemId) => {
          delete doc[this.options.path][itemId]
        })
      })

      return values.map((item) => select(params, this.id)(item)) as T[]
    }

    // Single remove
    if (!doc[this.options.path][id]) {
      throw new NotFound(`Item ${id} not found`)
    }

    const removed = doc[this.options.path][id] as T

    // Check if item matches query filters (excluding special operators like $select)
    const { $select, ...query } = params?.query ?? {}
    const hasQuery = Object.keys(query).length > 0

    if (hasQuery) {
      const matches = this.options.matcher(query)
      if (!matches(removed)) {
        throw new NotFound(`Item ${id} not found`)
      }
    }

    this.handle.change((doc) => {
      delete doc[this.options.path][id]
    })

    return select(params, this.id)(removed)
  }

  async setup() {
    this.handle.on('change', ({ patches, patchInfo, handle }) => {
      const { before, after } = patchInfo
      const emitter = this as unknown as EventEmitter
      const heads = handle.heads()

      if (typeof emitter.emit !== 'function') {
        return
      }

      // Only continue if document head has moved
      if (heads.every((head, index) => head === this.docHeads[index])) {
        return
      }

      this.docHeads = heads

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
