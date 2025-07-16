import { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { type Application } from '@feathersjs/feathers'
import { NotFound } from '@feathersjs/errors'
import feathers from '@feathersjs/feathers'
import createDebug from 'debug'
import { SyncServiceCreate, SyncServiceInfo, SyncServiceDocument } from '@kalisio/feathers-automerge'

const debug = createDebug('feathers-automerge-server/sync-service')

export type RootDocument = {
  documents: SyncServiceInfo[]
}

export interface SyncServiceOptions {
  rootDocumentId: string
  serverId: string
  syncServicePath: string
  initializeDocument(name: string, servicePath: string): Promise<unknown[]>
  getDocumentNames(data: unknown, servicePath: string): Promise<string[]>
}

export class AutomergeSyncServive {
  app?: Application
  rootDocument?: DocHandle<RootDocument>
  docHandles: Record<string, DocHandle<unknown>>

  constructor(
    public repo: Repo,
    public options: SyncServiceOptions
  ) {
    this.docHandles = {}
  }

  async find() {
    if (!this.rootDocument) {
      throw new Error('Root document not available. Did you call app.listen() or app.setup()?')
    }

    const doc = this.rootDocument.doc()

    if (!doc) {
      throw new Error('Root document not available')
    }

    return doc.documents
  }

  async get(name: string) {
    const docs = await this.find()
    const document = docs.find((document) => document.name === name)

    if (!document) {
      throw new NotFound(`Document ${name} not found`)
    }

    return document
  }

  async create(payload: SyncServiceCreate) {
    if (!this.app) {
      throw new Error('Application not available')
    }

    const docs = await this.find()
    const { name, services: serviceNames } = payload
    const existingDocument = docs.find((document) => document.name === name)

    if (existingDocument) {
      debug(`Returning existing document ${name}`)
      return existingDocument
    }

    const services =
      serviceNames ?? Object.keys(this.app.services).filter((path) => path !== this.options.syncServicePath)
    const data = services.reduce(
      (res, path) => ({
        ...res,
        [path]: {}
      }),
      {
        __meta: {}
      } as SyncServiceDocument
    )

    await Promise.all(
      services.map(async (servicePath) => {
        if (servicePath === '__meta') {
          throw new Error(`Service path '__meta' is reserved`)
        }

        const serviceData = await this.options.initializeDocument(name, servicePath)
        const idField = this.app?.service(servicePath).id || 'id'

        data.__meta[servicePath] = { idField }
        data[servicePath] = serviceData.reduce<Record<string, unknown>>((res, current) => {
          return {
            ...(res as Record<string, unknown>),
            [(current as any)[idField]]: {
              ...(current as Record<string, unknown>),
              __source: this.options.serverId
            }
          }
        }, {})
      })
    )

    const doc = this.repo.create(data)
    const url = doc.url
    const info = {
      name,
      url
    }
    debug('Created new Automerge document', info)

    this.docHandles[name] = doc

    await new Promise<SyncServiceInfo>(async (resolve) => {
      this.rootDocument!.change((doc) => {
        doc.documents.push(info)
        resolve(info)
      })
    })

    await this.handleDocument(info)

    return info
  }

  async handleEvent(servicePath: string, eventName: string, data: any) {
    if (!this.app) {
      throw new Error('Feathers application not available. Did you call app.listen() or app.setup()?')
    }

    debug(`Handling service event ${servicePath} ${eventName}`)

    const { getDocumentNames, serverId } = this.options
    const service = this.app.service(servicePath)
    const docNames = await getDocumentNames(data, servicePath)
    const idField = service.id || 'id'
    const updateDocument = async (handle: DocHandle<unknown>) =>
      new Promise<void>((resolve) => {
        handle.change((doc: any) => {
          const id = data[idField]

          if (doc[servicePath]) {
            if (eventName === 'removed' && doc[servicePath][id]) {
              debug(`Removing ${id} from ${servicePath}`)
              delete doc[servicePath][id]
            }

            if (['updated', 'patched', 'created'].includes(eventName)) {
              debug(`Updating ${id} for ${servicePath}`)
              doc[servicePath][id] = {
                ...data,
                __source: serverId
              }
            }
          }
          resolve()
        })
      })

    await Promise.all(
      docNames
        .map((name) => this.docHandles[name])
        .filter(Boolean)
        .map(updateDocument)
    )
  }

  async handleDocument({ name, url }: SyncServiceInfo) {
    const handle = await this.repo.find(url)

    this.docHandles[name] = handle

    handle.on('change', async ({ patches, patchInfo }) => {
      const { before, after } = patchInfo as any
      const serviceChanges: Record<string, Set<string>> = {}

      debug(`Handling change on document ${name}`)

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
              const { __source, ...data } = after[path][id] || before[path][id]
              const isFromServer = __source === this.options.serverId

              if (!before[path] || !before[path][id]) {
                // Created
                if (!isFromServer) {
                  debug(`Service ${path} create ${id}`)
                  await this.app.service(path).create(data)
                }
              } else if (!after[path][id]) {
                // Removed
                debug(`Service ${path} remove ${id}`)
                await this.app.service(path).remove(id)
              } else if (before[path] && before[path][id]) {
                // Patched
                if (!isFromServer) {
                  debug(`Service ${path} patch ${id}`)
                  await this.app.service(path).patch(id, data)
                }
              }
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
          service.on(eventName, async (data) => {
            const converted = JSON.parse(JSON.stringify(data))
            this.handleEvent(servicePath, eventName, converted)
          })
        )
      }
    })
  }
}
