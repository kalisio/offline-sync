import { AnyDocumentId, Repo } from '@automerge/automerge-repo'
import { Application, feathers } from '@feathersjs/feathers'
import {
  AutomergeService,
  ServiceDataDocument
} from '@kalisio/feathers-automerge'

export interface SyncServiceSettings {
  service: string
  url: string
  idField?: string
}

export type AutomergeApplication = Application<any, { repo: Repo }>

export function initSyncService (
  sync: SyncServiceSettings,
  automergeApp: AutomergeApplication,
  serverApp: Application
) {
  const handle = automergeApp
    .get('repo')
    .find<ServiceDataDocument<any>>(sync.url as AnyDocumentId)
  const automergeService = new AutomergeService<any>(handle, {
    idField: sync.idField
  })
  const idField = sync.idField || '_id'

  console.log('Setting up automerge service', sync.service)
  automergeApp.use(sync.service, automergeService)

  automergeApp.service(sync.service).on('created', (data) => {
    console.log('Automerge app create', data)
    serverApp
      .service(sync.service)
      .create(data)
      .catch((e) => console.error(e))
  })

  automergeApp.service(sync.service).on('patched', (data) => {
    const { [idField]: _id, ...rest } = data
    const id = _id.toString()
    console.log('Automerge app patch', rest)
    serverApp
      .service(sync.service)
      .patch(id, rest)
      .catch((e) => console.error(e))
  })

  automergeApp.service(sync.service).on('updated', (data) => {
    const { [idField]: _id, ...rest } = data
    const id = _id.toString()
    console.log('Automerge app update', rest)
    serverApp
      .service(sync.service)
      .update(id, rest)
      .catch((e) => console.error(e))
  })

  automergeApp.service(sync.service).on('removed', (data) => {
    console.log('Automerge app remove', data)
    const id = data[idField].toString()
    serverApp
      .service(sync.service)
      .remove(id)
      .catch((e) => console.error(e))
  })

  serverApp.service(sync.service).on('created', async (data) => {
    console.log('Server create', data)

    const service = automergeApp.service(
      sync.service
    ) as unknown as AutomergeService<unknown>
    const doc = await service.handle.doc()
    const id = data[idField].toString()

    if (data && doc && !doc[id]) {
      automergeApp
        .service(sync.service)
        .create(data)
        .catch((e) => console.error(e))
    }
  })

  serverApp.service(sync.service).on('patched', async (data) => {
    const service = automergeApp.service(
      sync.service
    ) as unknown as AutomergeService<unknown>
    const doc = await service.handle.doc()
    const { [idField]: _id, ...payload } = data
    const id = _id.toString()

    console.log('Server patch', payload)

    if (doc && doc[id]) {
      const docData = doc[id]
      // Check if doc[data._id] is different than data
      const isChanged = Object.keys(payload).some(
        (key) => docData[key] !== payload[key]
      )

      if (isChanged) {
        automergeApp
          .service(sync.service)
          .patch(id, payload)
          .catch((e) => console.error(e))
      }
    }
  })

  serverApp.service(sync.service).on('updated', async (data) => {
    const service = automergeApp.service(
      sync.service
    ) as unknown as AutomergeService<unknown>
    const doc = await service.handle.doc()
    const { [idField]: _id, ...payload } = data
    const id = _id.toString()

    console.log('Server update', payload)

    if (doc && doc[id]) {
      const docData = doc[id]
      // Check if doc[data._id] is different than data
      const isChanged = Object.keys(payload).some(
        (key) => docData[key] !== payload[key]
      )

      if (isChanged) {
        automergeApp
          .service(sync.service)
          .update(id, payload)
          .catch((e) => console.error(e))
      }
    }
  })

  serverApp.service(sync.service).on('removed', async (data) => {
    const service = automergeApp.service(
      sync.service
    ) as unknown as AutomergeService<unknown>
    const doc = await service.handle.doc()
    const id = data[idField].toString()

    console.log('Server remove', data)

    if (doc && doc[id]) {
      automergeApp
        .service(sync.service)
        .remove(id)
        .catch((e) => console.error(e))
    }
  })
}

export async function createAutomergeApp (
  app: Application,
  repo: Repo,
  syncs: SyncServiceSettings[]
) {
  const automergeApp = feathers()

  automergeApp.set('repo', repo)

  syncs.forEach((sync) => initSyncService(sync, automergeApp, app))

  await automergeApp.setup()

  return automergeApp
}
