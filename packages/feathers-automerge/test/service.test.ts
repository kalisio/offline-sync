import { describe, beforeAll, test } from 'vitest'
import { feathers } from '@feathersjs/feathers'
import assert from 'assert'

import { AutomergeService, SyncServiceDocument } from '../src/index.js'
import { Repo } from '@automerge/automerge-repo'

import { defineTestSuite } from 'feathers-adapter-vitest'

const testSuite = defineTestSuite({
  skip: ['._get', '._find', '._create', '._update', '._patch', '._remove', '.events']
})

describe('@kalisio/feathers-automerge', () => {
  type Person = {
    id: number
    name: string
    age: number
  }

  type PersonCreate = Omit<Person, 'id'>

  const app = feathers<{
    people: AutomergeService<Person, PersonCreate>
  }>()
  const repo = new Repo()
  const handle = repo.create<SyncServiceDocument>({
    __meta: {
      peeps: {
        idField: 'id',
        paginate: {
          default: 10,
          max: 50
        }
      }
    },
    peeps: {}
  })

  app.use(
    'people',
    new AutomergeService<Person>(handle, {
      path: 'peeps'
    })
  )

  beforeAll(async () => {
    await app.setup()
  })

  test('basic functionality', async () => {
    const person = await app.service('people').create({
      name: 'John Doe',
      age: 30
    })

    assert.ok(person.id)

    const createdEvent = new Promise<Person>((resolve) =>
      app.service('people').once('created', (person) => {
        resolve(person)
      })
    )

    await app.service('people').create({
      name: 'Jane Doe',
      age: 25
    })

    assert.equal((await createdEvent).name, 'Jane Doe')

    const people = await app.service('people').find({
      paginate: true
    })

    assert.equal(people.total, 2)
    assert.equal(people.data.length, 2)

    const matchedPeople = await app.service('people').find({
      paginate: true,
      query: {
        name: 'Jane Doe'
      }
    })

    assert.equal(matchedPeople.total, 1)

    const patchedEvent = new Promise<Person>((resolve) =>
      app.service('people').once('patched', (person) => {
        resolve(person)
      })
    )

    await app.service('people').patch(person.id, {
      age: 31
    })

    assert.equal((await patchedEvent).age, 31)
    assert.equal((await app.service('people').get(person.id)).age, 31)

    const removedEvent = new Promise<Person>((resolve) =>
      app.service('people').once('removed', (person) => {
        resolve(person)
      })
    )

    await app.service('people').remove(person.id)

    assert.ok(await removedEvent)
  })

  testSuite({ app: app as any, serviceName: 'people', idProp: 'id' })
})
