import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { feathers } from '@feathersjs/feathers'
import { MemoryService } from '@feathersjs/memory'
import express, { Application } from '@feathersjs/express'
import { AnyDocumentId } from '@automerge/automerge-repo'
import { Query, SyncServiceInfo } from '@kalisio/feathers-automerge'

import { automergeServer, createRootDocument } from '../src'
import { AutomergeSyncServive } from '../src/sync-service'

type Todo = {
  id: number
  title: string
  completed: boolean
  username: string
}

type ServicesDocument = { todos: Record<string, Todo> }

describe('@kalisio/feathers-automerge-server', () => {
  // __dirname in es module
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const directory = path.join(__dirname, '..', '..', '..', 'data', 'automerge-test')

  let todo1: Todo
  let todo2: Todo
  let app: Application<{
    todos: MemoryService<Todo>
    automerge: AutomergeSyncServive
  }>

  beforeAll(async () => {
    const rootDoc = await createRootDocument(directory)

    app = express(feathers<{ todos: MemoryService; automerge: AutomergeSyncServive }>())
    app.use('todos', new MemoryService())
    app.configure(
      automergeServer({
        directory,
        rootDocumentId: rootDoc.url,
        serverId: 'test-server',
        syncServicePath: 'automerge',
        async initializeDocument(servicePath: string, query: Query) {
          if (servicePath === 'todos') {
            const { username } = query as { username: string }
            return app.service('todos').find({
              paginate: false,
              query: { username }
            })
          }

          return []
        },
        async getDocumentsForData(servicePath: string, data: unknown, documents: SyncServiceInfo[]) {
          if (servicePath === 'todos') {
            return documents.filter((doc) => (data as Todo).username === doc.query.username)
          }

          return []
        }
      })
    )

    todo1 = await app.service('todos').create({
      title: 'First test todo',
      completed: false,
      username: 'testuser'
    })

    todo2 = await app.service('todos').create({
      title: 'My test todo',
      completed: false,
      username: 'otheruser'
    })

    await app.listen(8787)
  })

  it('initialised the automerge service', () => {
    expect(app.service('automerge')).toBeDefined()
  })

  it('initialised the root document', async () => {
    expect(app.service('automerge').rootDocument).toBeDefined()

    const doc = app.service('automerge').rootDocument?.doc()

    expect(doc).toEqual({
      documents: []
    })
  })

  it('creates a new document, initialises with correct records and stays up to date', async () => {
    const info = await app.service('automerge').create({
      query: {
        username: 'testuser'
      }
    })

    expect(info.url.startsWith('automerge:')).toBe(true)
    expect(info.query).toEqual({
      username: 'testuser'
    })

    const info2 = await app.service('automerge').create({
      query: {
        username: 'testuser'
      }
    })

    expect(info2.url).toEqual(info.url)

    const newDocument = await app.service('automerge').repo.find<ServicesDocument>(info.url as AnyDocumentId)
    const newContents = newDocument.doc() as { todos: Record<string, Todo> }

    expect(newContents.todos).toBeDefined()
    expect(Object.values(newContents.todos).length).toBe(1)

    const latestTodo = await app.service('todos').create({
      title: 'New test todo',
      completed: false,
      username: 'testuser'
    })

    todo1 = await app.service('todos').patch(todo1.id, {
      title: 'Updated test todo',
      completed: true
    })

    const updatedContents = newDocument.doc() as { todos: Record<string, Todo> }

    expect(Object.values(updatedContents.todos)).toEqual([
      {
        id: todo1.id,
        title: 'Updated test todo',
        completed: true,
        username: 'testuser',
        __source: 'test-server'
      },
      {
        id: latestTodo.id,
        title: 'New test todo',
        completed: false,
        username: 'testuser',
        __source: 'test-server'
      }
    ])

    await app.service('todos').remove(latestTodo.id)

    const latestContents = newDocument.doc()

    expect(Object.values(latestContents.todos)).toEqual([
      {
        id: todo1.id,
        title: 'Updated test todo',
        completed: true,
        username: 'testuser',
        __source: 'test-server'
      }
    ])
  })

  it('modifying the document syncs with service', async () => {
    const info = await app.service('automerge').create({
      query: {
        username: 'otheruser'
      }
    })

    expect(info.query).toEqual({
      username: 'otheruser'
    })

    const newDocument = await app.service('automerge').repo.find<ServicesDocument>(info.url as AnyDocumentId)
    const createdTodo = new Promise<Todo>((resolve) =>
      app.service('todos').once('created', (todo) => resolve(todo))
    )
    const patchedTodo = new Promise<Todo>((resolve) =>
      app.service('todos').once('patched', (todo) => resolve(todo))
    )
    const removedTodo = new Promise<Todo>((resolve) =>
      app.service('todos').once('removed', (todo) => resolve(todo))
    )

    newDocument.change((doc) => {
      doc.todos['3'] = {
        id: 3,
        title: 'Created in document',
        completed: false,
        username: 'otheruser'
      }
    })
    expect(await createdTodo).toEqual(await app.service('todos').get(3))

    newDocument.change((doc) => {
      doc.todos['3'] = {
        id: 3,
        title: 'Updated in document',
        completed: true,
        username: 'otheruser'
      }
    })

    expect(await patchedTodo).toEqual(await app.service('todos').get(3))
    newDocument.change((doc) => {
      delete doc.todos['3']
    })

    await removedTodo
    await expect(() => app.service('todos').get(3)).rejects.toThrow()
  })

  it('can delete a document', async () => {
    const info = await app.service('automerge').create({
      query: {
        username: 'deleteme'
      }
    })

    const deletedDocument = await app.service('automerge').remove(info.url)
    expect(deletedDocument).toEqual(info)
    await expect(() => app.service('automerge').get(info.url)).rejects.toThrow()
  })
})
