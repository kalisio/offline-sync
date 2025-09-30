import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { feathers } from '@feathersjs/feathers'
import { MemoryService } from '@feathersjs/memory'
import express, { Application } from '@feathersjs/express'
import { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { CHANGE_ID, generateUUID, Query, SyncServiceInfo } from '@kalisio/feathers-automerge'
import _ from 'lodash'

import {
  automergeServer,
  createRootDocument,
  SyncServerOptions,
  validateSyncServerOptions
} from '../src/index.js'
import { AutomergeSyncServive, RootDocument } from '../src/sync-service.js'

type Todo = {
  id: number
  title: string
  completed: boolean
  username: string
}

type ServicesDocument = { todos: Record<string, Todo & { [CHANGE_ID]: string }> }

export function createApp(
  options: Omit<SyncServerOptions, 'initializeDocument' | 'getDocumentsForData' | 'syncServicePath'>
) {
  const app = express(feathers<{ todos: MemoryService; automerge: AutomergeSyncServive }>())

  app.use('todos', new MemoryService())
  app.configure(
    automergeServer({
      ...options,
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

  return app
}

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
  let rootDoc: DocHandle<RootDocument>

  beforeAll(async () => {
    rootDoc = await createRootDocument(directory)

    app = createApp({
      directory,
      serverId: 'test-server',
      rootDocumentId: rootDoc.url,
      async authenticate() {
        return true
      }
    })

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
    expect(todo1).toBeDefined()
    expect(todo2).toBeDefined()
  })

  it('initialised the root document', async () => {
    expect(app.service('automerge').rootDocument).toBeDefined()

    const doc = app.service('automerge').rootDocument?.doc()

    expect(doc).toEqual({
      documents: []
    })
  })

  it('createRootDocument', async () => {
    const doc = await createRootDocument(directory)

    expect(doc).toBeDefined()
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

    const getTodos = () => {
      const updatedContents = newDocument.doc() as { todos: Record<string, Todo> }

      return Object.values(updatedContents.todos).map((todo) => {
        expect(todo[CHANGE_ID]).toBeDefined()
        return _.omit(todo, CHANGE_ID)
      })
    }

    expect(getTodos()).toEqual([
      {
        id: todo1.id,
        title: 'Updated test todo',
        completed: true,
        username: 'testuser'
      },
      {
        id: latestTodo.id,
        title: 'New test todo',
        completed: false,
        username: 'testuser'
      }
    ])

    await app.service('todos').remove(latestTodo.id)

    expect(getTodos()).toEqual([
      {
        id: todo1.id,
        title: 'Updated test todo',
        completed: true,
        username: 'testuser'
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
        username: 'otheruser',
        [CHANGE_ID]: generateUUID()
      }
    })
    expect(await createdTodo).toEqual(await app.service('todos').get(3))

    newDocument.change((doc) => {
      doc.todos['3'] = {
        id: 3,
        title: 'Updated in document',
        completed: true,
        username: 'otheruser',
        [CHANGE_ID]: generateUUID()
      }
    })

    expect(await patchedTodo).toEqual(await app.service('todos').get(3))
    newDocument.change((doc) => {
      delete doc.todos['3']
    })

    await removedTodo
    await expect(() => app.service('todos').get(3)).rejects.toThrow()
  })

  it('syncs multiple documents either way, does not end up in loops', async () => {
    const info = await app.service('automerge').create({
      query: {
        username: 'multiuser',
        multi: 1
      }
    })

    const info2 = await app.service('automerge').create({
      query: {
        username: 'multiuser',
        multi: 2
      }
    })

    const document1 = await app.service('automerge').repo.find<ServicesDocument>(info.url as AnyDocumentId)
    const document2 = await app.service('automerge').repo.find<ServicesDocument>(info2.url as AnyDocumentId)
    const createdTodo = new Promise<Todo>((resolve) =>
      app.service('todos').once('created', (todo) => resolve(todo))
    )
    const newTodo = {
      id: 3,
      title: 'Created in document',
      completed: false,
      username: 'multiuser'
    }

    expect(info.url).not.toEqual(info2.url)

    document1.change((doc) => {
      doc.todos['3'] = {
        ...newTodo,
        [CHANGE_ID]: generateUUID()
      }
    })

    expect(await createdTodo).toEqual(newTodo)
    expect(document1.doc().todos).toEqual(document2.doc().todos)

    await app.service('todos').patch(3, {
      completed: true,
      title: 'Update from server'
    })

    expect(document1.doc().todos[3].completed).toBe(true)
    expect(document1.doc().todos[3].title).toEqual('Update from server')
    expect(document2.doc().todos[3].completed).toBe(true)
    expect(document2.doc().todos[3].title).toEqual('Update from server')
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

  it('server to server sync', async () => {
    const info = await app.service('automerge').create({
      query: {
        username: 'syncuser'
      }
    })
    const existingTodo = await app.service('todos').create({
      title: 'Todo to sync',
      completed: false,
      username: 'syncuser'
    })
    const directory2 = path.join(__dirname, '..', '..', '..', 'data', 'automerge-test2')
    const app2 = createApp({
      directory: directory2,
      rootDocumentId: rootDoc.url,
      serverId: 'test-server-2',
      syncServerUrl: 'http://localhost:8787/',
      async authenticate() {
        return true
      }
    })

    await app2.listen(8989)

    const documents = await app.service('automerge').find()
    const documents2 = await app2.service('automerge').find()

    expect(info.url).toBeDefined()
    expect(documents).toEqual(documents2)

    const app2TodoCreated = new Promise((resolve) =>
      app2.service('todos').once('created', (todo) => resolve(todo))
    )
    const syncTodo = await app.service('todos').create({
      title: 'Todo to sync',
      completed: false,
      username: 'syncuser'
    })

    expect(syncTodo).toEqual(await app2TodoCreated)

    const app2Todos = await app2.service('todos').find({
      paginate: false
    })

    expect(app2Todos.length).toBeGreaterThan(1)

    await app.service('automerge').repo.flush()
    await app.service('automerge').repo.flush()
  })

  describe('validateSyncServerOptions', () => {
    const validOptions: SyncServerOptions = {
      directory: '/path/to/directory',
      serverId: 'test-server',
      rootDocumentId: 'test-root-doc',
      syncServicePath: 'automerge',
      authenticate: async () => true,
      initializeDocument: async () => [],
      getDocumentsForData: async () => []
    }

    it('should pass with valid options', () => {
      expect(() => validateSyncServerOptions(validOptions)).not.toThrow()
      expect(validateSyncServerOptions(validOptions)).toBe(true)
    })

    it('should throw if options is null or undefined', () => {
      expect(() => validateSyncServerOptions(null)).toThrow('SyncServerOptions must be an object')
      expect(() => validateSyncServerOptions(undefined)).toThrow('SyncServerOptions must be an object')
    })

    it('should pass with all optional properties set', () => {
      const fullOptions = {
        ...validOptions,
        getAccessToken: async () => 'token',
        syncServerUrl: 'ws://localhost:3030',
        syncServerWsPath: 'sync'
      }
      expect(() => validateSyncServerOptions(fullOptions)).not.toThrow()
      expect(validateSyncServerOptions(fullOptions)).toBe(true)
    })
  })
})
