import { describe, beforeAll, test } from 'vitest'
import { feathers } from '@feathersjs/feathers'
import assert from 'assert'

import { AutomergeService, ServiceDataDocument } from '../src/index.js'
import { Repo } from '@automerge/automerge-repo'

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
  const handle = repo.create<ServiceDataDocument<Person>>({
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
  })
})
