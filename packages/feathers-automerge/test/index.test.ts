import { describe, it, expect, beforeAll } from 'vitest'
import { feathers } from '@feathersjs/feathers'
import { SyncServiceCreate, SyncServiceDocument } from '../src/utils.js'
import { automergeClient, stopSyncOffline, syncOffline } from '../src/index.js'
import { Repo } from '@automerge/automerge-repo'

class DummySyncService {
  constructor(public repo: Repo) {}

  async create(data: SyncServiceCreate) {
    const handle = this.repo.create<SyncServiceDocument>({
      __meta: {
        people: {
          idField: 'id',
          paginate: false
        }
      },
      people: {}
    })

    return {
      ...data,
      url: handle.url
    }
  }
}

describe('@kailisio/feathers-automerge', () => {
  const app = feathers()
  const repo = new Repo()

  app.configure(
    automergeClient({
      syncServerUrl: 'http://localhost:3000',
      syncServicePath: 'automerge',
      authentication: false,
      repo
    })
  )
  app.use('automerge', new DummySyncService(repo))

  beforeAll(async () => {
    await app.setup()
  })

  it('syncOffline and stopSyncOffline', async () => {
    const info = await syncOffline(app, {
      query: {
        userId: 'test'
      }
    })

    expect(info.url.startsWith('automerge:'))
    expect(info.query).toStrictEqual({
      userId: 'test'
    })

    const person = await app.service('people').create({
      name: 'Test Person'
    })

    expect(person).toBeDefined()

    await stopSyncOffline(app)

    expect(() => app.service('people')).toThrow()
  })
})
