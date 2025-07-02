import { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { Application, getServiceOptions } from '@feathersjs/feathers'
import { NotFound } from '@feathersjs/errors'

type DocumentInfo = {
  name: string
  url: string
}

type RootDocument = {
  documents: DocumentInfo[]
}

type SyncConfig = {
  name: string
}

export interface ServiceOptions {
  rootDocument: string
  initializeDocument(name: string, servicePath: string): Promise<unknown[]>
  getDocumentNames(data: unknown, servicePath: string): Promise<string[]>
}

export class AutomergeSyncServive {
  app?: Application
  rootDocument?: DocHandle<RootDocument>
  docHandles: Record<string, DocHandle<unknown>>

  constructor(
    public repo: Repo,
    public options: ServiceOptions
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

  async create({ name }: SyncConfig) {
    if (!this.app) {
      throw new Error('Application not available')
    }

    const docs = await this.find()
    const existingDocument = docs.find((document) => document.name === name)

    if (existingDocument) {
      return existingDocument
    }

    const services = Object.keys(this.app.services).filter((path) => path !== 'automerge')
    const data = services.reduce(
      (res, path) => ({
        ...res,
        [path]: {}
      }),
      {} as Record<string, unknown>
    )

    await Promise.all(
      services.map(async (servicePath) => {
        const serviceData = await this.options.initializeDocument(name, servicePath)
        const idField = this.app?.service(servicePath).id || 'id'

        data[servicePath] = serviceData.reduce((res, current) => {
          return {
            ...(res as Record<string, unknown>),
            [(current as any)[idField]]: current
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

    this.docHandles[name] = doc

    await new Promise<DocumentInfo>(async (resolve) => {
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

    const service = this.app.service(servicePath)
    const docNames = await this.options.getDocumentNames(data, servicePath)
    const idField = service.id || 'id'

    await Promise.all(
      docNames
        .map((name) => this.docHandles[name])
        .filter(Boolean)
        .map(
          async (handle) =>
            new Promise<void>((resolve) => {
              handle.change((doc: any) => {
                const id = data[idField]

                if (doc[servicePath]) {
                  if (eventName === 'removed') {
                    delete doc[servicePath][id]
                  } else if (['updated', 'patched', 'created'].includes(eventName)) {
                    doc[servicePath][id] = data
                  }
                }
                resolve()
              })
            })
        )
    )
  }

  async handleDocument(info: DocumentInfo) {
    const { name, url } = info
    const handle = await this.repo.find(url as AnyDocumentId)

    this.docHandles[name] = handle

    handle.on('change', ({ patches, patchInfo }) => {
      const { before, after } = patchInfo as any
      const serviceChanges: Record<string, Set<string>> = {}

      patches.forEach((patch) => {
        const [path, id] = patch.path
        serviceChanges[path] = serviceChanges[path] || new Set()
        serviceChanges[path].add(id.toString())
      })

      Object.keys(serviceChanges).forEach((path) => {
        const ids = Array.from(serviceChanges[path])

        for (const id of ids) {
          if (!before[path] || !before[path][id]) {
            console.log(path, 'created', after[path][id])
          } else if (!after[path][id]) {
            console.log(path, 'removed', before[path][id])
          } else if (before[path] && before[path][id]) {
            console.log(path, 'patched', after[path][id])
          }
        }
      })
    })
  }

  async setup(app: Application, myPath: string) {
    this.app = app
    this.rootDocument = await this.repo.find<RootDocument>(this.options.rootDocument as AnyDocumentId)

    const infos = await this.find()

    await Promise.all(infos.map((info) => this.handleDocument(info)))

    Object.keys(app.services).forEach((servicePath) => {
      if (servicePath !== myPath) {
        const service = app.service(servicePath)
        const options = getServiceOptions(service)

        options.serviceEvents?.forEach((eventName) =>
          service.on(eventName, async (data) => this.handleEvent(servicePath, eventName, data))
        )
      }
    })
  }
}
