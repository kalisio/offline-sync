import { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import type { HookContext, Params, Application } from '@feathersjs/feathers'
import { Forbidden, NotFound } from '@feathersjs/errors'
import feathers from '@feathersjs/feathers'
import { AdapterServiceOptions } from '@feathersjs/adapter-commons'
import createDebug from 'debug'
import _ from 'lodash'
import {
  SyncServiceCreate,
  SyncServiceInfo,
  SyncServiceDocument,
  Query,
  generateObjectId,
  generateUUID,
  CHANGE_ID
} from '@kalisio/feathers-automerge'

const debug = createDebug('feathers-automerge-server/sync-service')

export interface SyncServiceParams extends Params<Query> {
  user?: any
}

export type RootDocument = {
  documents: SyncServiceInfo[]
}

export interface SyncServiceOptions {
  rootDocumentId: string
  syncServicePath: string
  canAccess: <T = unknown>(query: Query, user: T) => Promise<boolean>
  initializeDocument(
    servicePath: string,
    query: Query,
    documents: SyncServiceInfo[]
  ): Promise<unknown[] | null>
  getDocumentsForData(
    servicePath: string,
    data: unknown,
    documents: SyncServiceInfo[]
  ): Promise<SyncServiceInfo[]>
}

export class AutomergeSyncService {
  app?: Application
  rootDocument?: DocHandle<RootDocument>
  docHandles: Record<string, DocHandle<unknown>> = {}
  processedChanges = new Set<string>()
  // Track removals initiated by handleEvent to prevent syncing back to service
  // Format: "url:servicePath:id"
  pendingRemovals = new Set<string>()

  constructor(
    public repo: Repo,
    public options: SyncServiceOptions
  ) {}

  async checkAccess(query: Query, params: SyncServiceParams, throwError = true) {
    if (params.provider) {
      const allowed = await this.options.canAccess(query, params.user)

      if (!allowed && throwError) {
        throw new Forbidden('Access not allowed for this user')
      }

      return allowed
    }

    return true
  }

  async find(params: SyncServiceParams = {}) {
    if (!this.rootDocument) {
      throw new Error('Root document not available. Did you call app.listen() or app.setup()?')
    }

    const doc = this.rootDocument.doc()

    if (!doc) {
      throw new Error('Root document not available')
    }

    const results = await Promise.all(
      doc.documents.map(async (document) => ({
        document,
        allowed: await this.checkAccess(document.query, params, false)
      }))
    )

    return results.filter((result) => result.allowed).map((result) => result.document)
  }

  async get(url: string, params: SyncServiceParams = {}) {
    const syncInfo = (await this.find(params)).find((document) => document.url === url)

    if (!syncInfo || !this.docHandles[url] || !(await this.checkAccess(syncInfo.query, params, false))) {
      throw new NotFound(`Document ${url} not found`)
    }

    const handle = this.docHandles[url]

    return handle.doc()
  }

  async create(payload: SyncServiceCreate, params: SyncServiceParams = {}) {
    if (!this.app) {
      throw new Error('Application not available')
    }

    if (!this.rootDocument) {
      throw new Error('Root document not available')
    }

    const docs = this.rootDocument.doc().documents
    const { query } = payload
    const existingDocument = docs.find((document) => _.isEqual(document.query, query))

    await this.checkAccess(query, params)

    if (existingDocument) {
      debug(`Returning existing document ${existingDocument.url}`)
      return existingDocument
    }

    const services = Object.keys(this.app.services).filter((path) => path !== this.options.syncServicePath)
    const data: SyncServiceDocument = {
      __meta: {}
    }
    const changeId = generateUUID()

    await Promise.all(
      services.map(async (servicePath) => {
        if (servicePath === '__meta') {
          throw new Error(`Service path '__meta' is reserved`)
        }
        const service = this.app?.service(servicePath)
        const serviceOptions = feathers.getServiceOptions(service) as AdapterServiceOptions
        const serviceData = await this.options.initializeDocument(servicePath, query, docs)

        if (serviceData !== null) {
          const convertedData: unknown[] = JSON.parse(JSON.stringify(serviceData))
          const idField = service?.id || 'id'
          const paginate = serviceOptions?.paginate || { default: 10, max: 10 }

          data.__meta[servicePath] = { idField, paginate }
          data[servicePath] = convertedData.reduce<Record<string, unknown>>(
            (res, current) => {
              const id = (current as any)[idField] ?? generateObjectId()
              return {
                ...res,
                [id]: {
                  ...(current as Record<string, unknown>),
                  [CHANGE_ID]: changeId
                }
              }
            },
            {} as Record<string, unknown>
          )
        }
      })
    )

    const doc = this.repo.create(data)
    const url = doc.url
    const info = {
      url,
      query
    }
    debug('Created new Automerge document', info)

    this.docHandles[url] = doc

    await new Promise<SyncServiceInfo>(async (resolve) => {
      this.rootDocument!.change((doc) => {
        doc.documents.push(info)
        resolve(info)
      })
    })

    await this.handleDocument(info)

    return info
  }

  async remove(url: string, params: SyncServiceParams = {}) {
    if (!this.rootDocument) {
      throw new Error('Root document not available')
    }

    const docs = this.rootDocument.doc().documents
    const index = docs.findIndex((d) => d.url === url)

    if (index === -1) {
      throw new NotFound(`Document with URL ${url} not found`)
    }

    const info = docs[index]

    await this.checkAccess(info.query, params)

    await new Promise<void>((resolve) => {
      this.rootDocument!.change((doc) => {
        doc.documents.splice(index, 1)
        resolve()
      })
    })

    this.repo.delete(url as AnyDocumentId)
    delete this.docHandles[url]

    return info
  }

  async handleEvent(servicePath: string, eventName: string, data: any, context: HookContext) {
    if (!this.app) {
      throw new Error('Feathers application not available. Did you call app.listen() or app.setup()?')
    }

    if (!this.rootDocument) {
      throw new Error('Root document not available')
    }

    debug(`Handling service event ${servicePath} ${eventName}`)

    const { getDocumentsForData } = this.options
    const documents = this.rootDocument.doc().documents
    const service = this.app.service(servicePath)
    const syncDocuments = await getDocumentsForData(servicePath, data, documents)
    const idField = service.id || 'id'
    const currentChangeId = context.params.automerge?.changeId || generateUUID()
    const id = data[idField]

    // Build a set of URLs that should contain this data
    const matchingUrls = new Set(syncDocuments.map(({ url }) => url))

    // Update or remove data in all documents
    const updatePromises = documents.map(({ url }) => {
      const handle = this.docHandles[url]
      if (!handle) return Promise.resolve()

      const shouldContain = matchingUrls.has(url)

      return new Promise<void>((resolve) => {
        handle.change((doc: any) => {
          const changeId: string = _.get(doc, [servicePath, id, CHANGE_ID])

          if (doc[servicePath] && currentChangeId !== changeId) {
            const exists = doc[servicePath][id] !== undefined

            if (eventName === 'removed' || !shouldContain) {
              // Remove if: 1) explicit removal, or 2) doesn't match query
              if (exists) {
                debug(`Removing ${id} from ${servicePath} in document ${url}`)
                // Track this removal to prevent syncing back to service
                this.pendingRemovals.add(`${url}:${servicePath}:${id}`)
                delete doc[servicePath][id]
              }
            } else if (shouldContain && ['updated', 'patched', 'created'].includes(eventName)) {
              // Add or update if matches query
              debug(`${exists ? 'Updating' : 'Adding'} ${id} for ${servicePath} in document ${url}`)
              doc[servicePath][id] = {
                ...data,
                [CHANGE_ID]: currentChangeId
              }
            }
          }

          resolve()
        })
      })
    })

    await Promise.all(updatePromises)

    this.processedChanges.add(currentChangeId)
  }

  async syncExistingData(handle: DocHandle<unknown>) {
    if (!this.app) {
      debug('Feathers application not available for syncing existing data')
      return
    }

    const doc = handle.doc() as any
    if (!doc) {
      debug('Document not available for syncing existing data')
      return
    }

    debug(`Syncing existing data from document ${handle.url}`)

    const meta = doc.__meta || {}

    // Process each service's data in the document
    for (const servicePath of Object.keys(doc)) {
      if (servicePath === '__meta' || !this.app.service(servicePath)) {
        continue
      }

      const serviceData = doc[servicePath]
      if (!serviceData || typeof serviceData !== 'object') {
        continue
      }

      const serviceMeta = meta[servicePath]
      const idField = serviceMeta?.idField || 'id'

      // Process each record in the service
      for (const record of Object.values(serviceData)) {
        const { [CHANGE_ID]: changeId, ...data } = record as any
        const params = { automerge: { changeId, initialSync: true } } as Params
        const service = this.app.service(servicePath)

        // Get the actual ID from the record using the service's idField
        const recordId = data[idField]

        // Check if record already exists locally
        try {
          await service.get(recordId)
        } catch (error: any) {
          // NOTE: comment test since it fails even when error is really NotFound
          // if (error instanceof NotFound) {
          if (error?.code === 404) {
            // Record doesn't exist, create it
            debug(`Creating new record ${servicePath}:${recordId} during initial sync`)
            await service.create(data, params)
          } else {
            throw error
          }
        }

        // Mark this change as processed to avoid loops
        this.processedChanges.add(changeId)
      }
    }
  }

  async handleDocument({ url }: SyncServiceInfo) {
    const handle = await this.repo.find(url)

    this.docHandles[url] = handle

    // Sync existing data from the document to local services
    await this.syncExistingData(handle)

    handle.on('change', async ({ patches, patchInfo }) => {
      const { before, after } = patchInfo as any
      const serviceChanges: Record<string, Set<string>> = {}

      debug(`Handling change on document ${url}`)

      patches.forEach((patch) => {
        const [path, id] = patch.path
        serviceChanges[path] = serviceChanges[path] || new Set()
        serviceChanges[path].add(id.toString())
      })

      await Promise.all(
        Object.keys(serviceChanges).map(async (path) => {
          const ids = Array.from(serviceChanges[path])

          if (!this.app) {
            debug('Feathers application not available')
            return
          }

          for (const id of ids) {
            try {
              const documentItem = after[path][id] || before[path][id]
              const { [CHANGE_ID]: changeId, ...data } = documentItem
              const params = { automerge: { changeId, patches, patchInfo } } as Params

              if (!before[path]?.[id]) {
                if (!this.processedChanges.has(changeId)) {
                  // Created
                  debug(`Service ${path} create ${id}`)
                  await this.app.service(path).create(data, params)
                }
              } else if (!after[path]?.[id]) {
                // Removed
                const removalKey = `${url}:${path}:${id}`
                if (this.pendingRemovals.has(removalKey)) {
                  // This removal was initiated by handleEvent, don't sync back to service
                  debug(`Skipping service ${path} remove ${id} (initiated by handleEvent)`)
                  this.pendingRemovals.delete(removalKey)
                } else {
                  // This removal was initiated by document change, sync to service
                  debug(`Service ${path} remove ${id}`)
                  await this.app.service(path).remove(id, params)
                }
              } else if (before[path]?.[id]) {
                if (!this.processedChanges.has(changeId)) {
                  // Patched
                  debug(`Service ${path} patch ${id}`)
                  await this.app.service(path).patch(id, data, params)
                }
              }

              this.processedChanges.add(changeId)
            } catch (error: unknown) {
              console.error(error)
            }
          }
        })
      )
    })
  }

  async setup(app: Application, myPath: string) {
    this.app = app
    this.rootDocument = await this.repo.find<RootDocument>(this.options.rootDocumentId as AnyDocumentId)

    const infos = await this.find()

    await Promise.all(infos.map((info) => this.handleDocument(info)))

    Object.keys(app.services).forEach((servicePath) => {
      if (servicePath !== myPath) {
        const service = app.service(servicePath)
        const options = feathers.getServiceOptions(service)

        debug(`Listening to service ${servicePath} events ${options.serviceEvents}`)

        options.serviceEvents?.forEach((eventName) =>
          service.on(eventName, async (payload, context) => {
            const data = JSON.parse(JSON.stringify(payload))
            this.handleEvent(servicePath, eventName, data, context)
          })
        )
      }
    })
  }
}
