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
    data: {}
  })

  app.use('people', new AutomergeService<Person>(handle))

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

  test('configurable dataField option', async () => {
    // Create a service with custom dataField
    const customHandle = repo.create<ServiceDataDocument<Person>>({
      service: 'custom-people',
      records: {} // Using 'records' instead of 'data'
    })

    const customService = new AutomergeService<Person>(customHandle, {
      dataField: 'records'
    })

    app.use('custom-people', customService)

    // Test that the custom dataField works
    const person = await app.service('custom-people').create({
      name: 'Custom Person',
      age: 40
    })

    assert.ok(person.id)
    assert.equal(person.name, 'Custom Person')

    // Verify the document structure uses the custom field
    const doc = await customHandle.doc()
    assert.ok(doc)
    assert.ok(doc.records)
    assert.ok(doc.records[person.id])
    assert.equal(doc.records[person.id].name, 'Custom Person')

    // Test find operation works with custom dataField
    const results = await app.service('custom-people').find({
      paginate: false
    })

    assert.equal(results.length, 1)
    assert.equal(results[0].name, 'Custom Person')
  })
})
