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
import { AutomergeSyncService, RootDocument } from '../src/sync-service.js'

type Todo = {
  id: number
  title: string
  completed: boolean
  username: string
}

type ServicesDocument = { todos: Record<string, Todo & { [CHANGE_ID]: string }> }

type CreateAppOptions = Omit<
  SyncServerOptions,
  'initializeDocument' | 'getDocumentsForData' | 'syncServicePath'
>

export function createApp(options: CreateAppOptions) {
  const app = express(feathers<{ todos: MemoryService; automerge: AutomergeSyncService }>())

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
    automerge: AutomergeSyncService
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
      },
      async canAccess() {
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

  describe('canAccess option', () => {
    let restrictedApp: Application<{
      todos: MemoryService<Todo>
      automerge: AutomergeSyncService
    }>

    beforeAll(async () => {
      restrictedApp = createApp({
        directory,
        serverId: 'restricted-server',
        rootDocumentId: rootDoc.url,
        async authenticate() {
          return true
        },
        async canAccess(query, user) {
          return (query as any).username === (user as any)?.username
        }
      })

      await restrictedApp.listen(9090)
    })

    it('blocks access to create when canAccess returns false', async () => {
      await expect(() =>
        restrictedApp.service('automerge').create(
          {
            query: { username: 'restricted' }
          },
          { provider: 'rest', user: { username: 'otheruser' } }
        )
      ).rejects.toThrow('Access not allowed for this user')
    })

    it('allows access to create when canAccess returns true', async () => {
      const info = await restrictedApp.service('automerge').create(
        {
          query: { username: 'alloweduser' }
        },
        { provider: 'rest', user: { username: 'alloweduser' } }
      )

      expect(info.url).toBeDefined()
      expect(info.query).toEqual({ username: 'alloweduser' })
    })

    it('filters documents in find based on canAccess', async () => {
      // Create documents for different users
      await restrictedApp.service('automerge').create({
        query: { username: 'user1' }
      })
      await restrictedApp.service('automerge').create({
        query: { username: 'user2' }
      })

      // User1 should only see their document
      const user1Docs = await restrictedApp.service('automerge').find({
        provider: 'rest',
        user: { username: 'user1' }
      })

      expect(user1Docs.length).toBe(1)
      expect(user1Docs[0].query).toEqual({ username: 'user1' })

      // User2 should only see their document
      const user2Docs = await restrictedApp.service('automerge').find({
        provider: 'rest',
        user: { username: 'user2' }
      })

      expect(user2Docs.length).toBe(1)
      expect(user2Docs[0].query).toEqual({ username: 'user2' })
    })

    it('blocks access to get when canAccess returns false', async () => {
      const info = await restrictedApp.service('automerge').create({
        query: { username: 'privateuser' }
      })

      await expect(() =>
        restrictedApp.service('automerge').get(info.url, {
          provider: 'rest',
          user: { username: 'otheruser' }
        })
      ).rejects.toThrow(`Document ${info.url} not found`)
    })

    it('blocks access to remove when canAccess returns false', async () => {
      const info = await restrictedApp.service('automerge').create({
        query: { username: 'protecteduser' }
      })

      await expect(() =>
        restrictedApp.service('automerge').remove(info.url, {
          provider: 'rest',
          user: { username: 'otheruser' }
        })
      ).rejects.toThrow('Access not allowed for this user')
    })

    it('bypasses canAccess check for internal calls without provider', async () => {
      // Internal calls (without provider) should work even if canAccess returns false
      const info = await restrictedApp.service('automerge').create({
        query: { username: 'internaluser' }
      })

      expect(info.url).toBeDefined()

      const found = await restrictedApp.service('automerge').find()
      expect(found.some((doc) => doc.url === info.url)).toBe(true)

      const removed = await restrictedApp.service('automerge').remove(info.url)
      expect(removed.url).toBe(info.url)
    })
  })

  describe('validateSyncServerOptions', () => {
    const validOptions: SyncServerOptions = {
      directory: '/path/to/directory',
      serverId: 'test-server',
      rootDocumentId: 'test-root-doc',
      syncServicePath: 'automerge',
      authenticate: async () => true,
      initializeDocument: async () => [],
      getDocumentsForData: async () => [],
      canAccess: async () => true
    }

    it('should pass with valid options', () => {
      expect(() => validateSyncServerOptions(validOptions)).not.toThrow()
      expect(validateSyncServerOptions(validOptions)).toBe(true)
    })

    it('should throw if options is null or undefined', () => {
      expect(() => validateSyncServerOptions(null as any)).toThrow('SyncServerOptions must be an object')
      expect(() => validateSyncServerOptions(undefined as any)).toThrow('SyncServerOptions must be an object')
    })

    it('should pass with all optional properties set', () => {
      const fullOptions = {
        ...validOptions,
        getAccessToken: async () => 'token',
        syncDocumentUrl: 'http://localhost:3030/automerge/automerge:test-doc-id',
        syncServerWsPath: 'sync'
      }
      expect(() => validateSyncServerOptions(fullOptions)).not.toThrow()
      expect(validateSyncServerOptions(fullOptions)).toBe(true)
    })
  })

  describe('server to server sync', () => {
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
        syncDocumentUrl: `http://localhost:8787/automerge/${info.url}`,
        async authenticate() {
          return true
        },
        async canAccess() {
          return true
        }
      })

      await app2.listen(8989)

      const documents = await app.service('automerge').find()
      const documents2 = await app2.service('automerge').find()

      expect(info.url).toBeDefined()
      // app2 is in single document mode, so it only sees the one document it's syncing
      expect(documents2.length).toBe(1)
      expect(documents2[0].url).toBe(info.url)

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

    it('server to server sync - client server goes down and comes back up', async () => {
      const info = await app.service('automerge').create({
        query: {
          username: 'resilientuser'
        }
      })

      const directory3 = path.join(__dirname, '..', '..', '..', 'data', 'automerge-test3')
      let app3 = createApp({
        directory: directory3,
        rootDocumentId: rootDoc.url,
        serverId: 'test-server-3',
        syncDocumentUrl: `http://localhost:8787/automerge/${info.url}`,
        async authenticate() {
          return true
        },
        async canAccess() {
          return true
        }
      })

      const server3 = await app3.listen(8990)

      // Wait for initial sync
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify initial sync
      const initialDocs = await app3.service('automerge').find()
      expect(initialDocs.length).toBeGreaterThan(0)

      // Create a todo on server1 before server3 goes down
      const todo1 = await app.service('todos').create({
        title: 'Before shutdown',
        completed: false,
        username: 'resilientuser'
      })

      // Wait for sync
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify it synced
      const todos3Before = await app3.service('todos').find({ paginate: false })
      expect(todos3Before.find((t: Todo) => t.title === 'Before shutdown')).toBeDefined()

      // Shut down server3
      await new Promise<void>((resolve) => server3.close(() => resolve()))

      // Create data on server1 while server3 is down
      const todo2 = await app.service('todos').create({
        title: 'While down',
        completed: false,
        username: 'resilientuser'
      })

      const todo3 = await app.service('todos').create({
        title: 'Also while down',
        completed: true,
        username: 'resilientuser'
      })

      // Wait to ensure changes are persisted
      await app.service('automerge').repo.flush()

      // Restart server3 with same directory (persistence)
      app3 = createApp({
        directory: directory3,
        rootDocumentId: rootDoc.url,
        serverId: 'test-server-3',
        syncDocumentUrl: `http://localhost:8787/automerge/${info.url}`,
        async authenticate() {
          return true
        },
        async canAccess() {
          return true
        }
      })

      await app3.listen(8990)

      // Wait for reconnection and sync
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Verify all data is synchronized
      const todos3After = await app3.service('todos').find({ paginate: false })
      const resilientUserTodos = todos3After.filter((t: Todo) => t.username === 'resilientuser')

      expect(resilientUserTodos.find((t: Todo) => t.title === 'Before shutdown')).toBeDefined()
      expect(resilientUserTodos.find((t: Todo) => t.title === 'While down')).toBeDefined()
      expect(resilientUserTodos.find((t: Todo) => t.title === 'Also while down')).toBeDefined()

      // Verify the data is correct
      const whileDownTodo = resilientUserTodos.find((t: Todo) => t.title === 'While down')
      expect(whileDownTodo?.completed).toBe(false)

      const alsoWhileDownTodo = resilientUserTodos.find((t: Todo) => t.title === 'Also while down')
      expect(alsoWhileDownTodo?.completed).toBe(true)
    })

    it('server to server sync - client server goes down with updates and recovers', async () => {
      const directory4 = path.join(__dirname, '..', '..', '..', 'data', 'automerge-test4')

      // Create document first
      const info = await app.service('automerge').create({
        query: {
          username: 'recoveryuser'
        }
      })

      const todo1 = await app.service('todos').create({
        title: 'Before client start',
        completed: false,
        username: 'recoveryuser'
      })

      // Start client server
      let app4 = createApp({
        directory: directory4,
        rootDocumentId: rootDoc.url,
        serverId: 'test-server-4',
        syncDocumentUrl: `http://localhost:8787/automerge/${info.url}`,
        async authenticate() {
          return true
        },
        async canAccess() {
          return true
        }
      })

      let server4 = await app4.listen(8991)

      // Wait for initial sync
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Verify sync
      const todos4Initial = await app4.service('todos').find({ paginate: false })
      expect(todos4Initial.find((t: Todo) => t.title === 'Before client start')).toBeDefined()

      // Create data on main server
      await app.service('todos').create({
        title: 'From main before shutdown',
        completed: false,
        username: 'recoveryuser'
      })

      // Wait for sync
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Shut down client server
      await new Promise<void>((resolve) => server4.close(() => resolve()))

      // Create data on main server while client is down
      await app.service('todos').create({
        title: 'While client down',
        completed: false,
        username: 'recoveryuser'
      })

      await app.service('todos').create({
        title: 'Also while client down',
        completed: true,
        username: 'recoveryuser'
      })

      // Ensure changes are persisted
      await app.service('automerge').repo.flush()

      // Restart client server
      app4 = createApp({
        directory: directory4,
        rootDocumentId: rootDoc.url,
        serverId: 'test-server-4',
        syncDocumentUrl: `http://localhost:8787/automerge/${info.url}`,
        async authenticate() {
          return true
        },
        async canAccess() {
          return true
        }
      })

      server4 = await app4.listen(8991)

      // Wait for reconnection and sync
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Verify all data is synchronized on both servers
      const todosMain = await app.service('todos').find({ paginate: false })
      const todos4 = await app4.service('todos').find({ paginate: false })

      const mainRecoveryUser = todosMain.filter((t: Todo) => t.username === 'recoveryuser')
      const client4RecoveryUser = todos4.filter((t: Todo) => t.username === 'recoveryuser')

      // Both should have all 4 todos
      expect(mainRecoveryUser.length).toBe(4)
      expect(client4RecoveryUser.length).toBe(4)

      // Verify all todos exist on both servers
      const expectedTitles = [
        'Before client start',
        'From main before shutdown',
        'While client down',
        'Also while client down'
      ]

      expectedTitles.forEach((title) => {
        expect(mainRecoveryUser.find((t: Todo) => t.title === title)).toBeDefined()
        expect(client4RecoveryUser.find((t: Todo) => t.title === title)).toBeDefined()
      })

      // Verify the completed status is correct
      const alsoWhileDown = client4RecoveryUser.find((t: Todo) => t.title === 'Also while client down')
      expect(alsoWhileDown?.completed).toBe(true)
    })

    it.skip('server to server sync - bidirectional sync after reconnection', async () => {
      // Create document
      const info = await app.service('automerge').create({
        query: {
          username: 'bidirectionaluser'
        }
      })

      const directory5 = path.join(__dirname, '..', '..', '..', 'data', 'automerge-test5')
      let app5 = createApp({
        directory: directory5,
        rootDocumentId: rootDoc.url,
        serverId: 'test-server-5',
        syncDocumentUrl: `http://localhost:8787/automerge/${info.url}`,
        async authenticate() {
          return true
        },
        async canAccess() {
          return true
        }
      })

      const server5 = await app5.listen(8992)

      const initialTodo = await app.service('todos').create({
        title: 'Initial sync',
        completed: false,
        username: 'bidirectionaluser'
      })

      // Wait for sync
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Shut down app5
      await new Promise<void>((resolve) => server5.close(() => resolve()))

      // Create data on both servers while disconnected
      const todoMain = await app.service('todos').create({
        title: 'From main while disconnected',
        completed: false,
        username: 'bidirectionaluser'
      })

      // Restart app5
      app5 = createApp({
        directory: directory5,
        rootDocumentId: rootDoc.url,
        serverId: 'test-server-5',
        syncDocumentUrl: `http://localhost:8787/automerge/${info.url}`,
        async authenticate() {
          return true
        },
        async canAccess() {
          return true
        }
      })

      await app5.listen(8992)

      // Create data on app5 after restart
      const todoApp5 = await app5.service('todos').create({
        title: 'From app5 after restart',
        completed: true,
        username: 'bidirectionaluser'
      })

      // Wait for bidirectional sync
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Verify both servers have all data
      const todosMain = await app.service('todos').find({ paginate: false })
      const todos5 = await app5.service('todos').find({ paginate: false })

      const mainBidirectional = todosMain.filter((t: Todo) => t.username === 'bidirectionaluser')
      const app5Bidirectional = todos5.filter((t: Todo) => t.username === 'bidirectionaluser')

      // Both should have all three todos
      expect(mainBidirectional.length).toBe(3)
      expect(app5Bidirectional.length).toBe(3)

      expect(mainBidirectional.find((t: Todo) => t.title === 'Initial sync')).toBeDefined()
      expect(mainBidirectional.find((t: Todo) => t.title === 'From main while disconnected')).toBeDefined()
      expect(mainBidirectional.find((t: Todo) => t.title === 'From app5 after restart')).toBeDefined()

      expect(app5Bidirectional.find((t: Todo) => t.title === 'Initial sync')).toBeDefined()
      expect(app5Bidirectional.find((t: Todo) => t.title === 'From main while disconnected')).toBeDefined()
      expect(app5Bidirectional.find((t: Todo) => t.title === 'From app5 after restart')).toBeDefined()
    })
  })
})
