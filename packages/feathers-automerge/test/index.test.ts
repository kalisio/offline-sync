import { describe, it, expect, beforeAll } from 'vitest'
import { feathers } from '@feathersjs/feathers'
import { generateUUID, SyncServiceCreate, SyncServiceDocument } from '../src/utils.js'
import { automergeClient, stopSyncOffline, syncOffline } from '../src/index.js'
import { Repo } from '@automerge/automerge-repo'

class DummySyncService {
  constructor(public repo: Repo) {}

  async create(data: SyncServiceCreate) {
    const id = generateUUID()
    const handle = this.repo.create<SyncServiceDocument>({
      __meta: {
        people: {
          idField: 'id',
          paginate: false
        }
      },
      people: {
        [id]: {
          id,
          name: 'John Doe'
        }
      }
    })

    return {
      ...data,
      url: handle.url
    }
  }
}

class DummyPeopleService {
  people = [
    {
      id: generateUUID(),
      name: 'Person'
    }
  ]

  async find() {
    return this.people
  }

  async create(data: any) {
    const id = generateUUID()
    this.people.push({ id, ...data })
    return this.people.find((p) => p.id === id)
  }
}

describe('@kailisio/feathers-automerge', () => {
  const app = feathers<{ people: DummyPeopleService; automerge: DummySyncService }>()
  const repo = new Repo()

  app.defaultService = () => new DummyPeopleService()
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

    expect(await app.service('people').find()).toHaveLength(2)

    await stopSyncOffline(app)

    expect(await app.service('people').find()).toHaveLength(1)
  })
})
