import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { feathers } from '@feathersjs/feathers'
import { MemoryService } from '@feathersjs/memory'
import express, { Application } from '@feathersjs/express'

import { automergeServer, createRepo, createRootDocument } from '../src'
import { AutomergeSyncServive } from '../src/sync-service'
import { AnyDocumentId } from '@automerge/automerge-repo'

type Todo = {
  id: number
  title: string
  completed: boolean
  username: string
}

describe('@kalisio/feathers-automerge-server', () => {
  // __dirname in es module
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const directory = path.join(__dirname, '..', '..', '..', 'data', 'automerge-test')

  let todo1: Todo
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
        rootDocument: rootDoc.url,
        async initializeDocument(name: string, servicePath: string) {
          if (name.startsWith('user') && servicePath === 'todos') {
            const [, username] = name.split('/')
            return app.service('todos').find({
              paginate: false,
              query: { username }
            })
          }

          return []
        },
        async getDocumentNames(data: unknown, servicePath: string) {
          if (servicePath === 'todos') {
            return [`user/${(data as Todo).username}`]
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

    await app.service('todos').create({
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

    const doc = await app.service('automerge').rootDocument?.doc()

    expect(doc).toEqual({
      documents: []
    })
  })

  it('creates a new document, initialises with correct records and stays up to date', async () => {
    const info = await app.service('automerge').create({
      name: 'user/testuser'
    })

    expect(info.name).toBe('user/testuser')
    expect(info.url.startsWith('automerge:')).toBe(true)

    const info2 = await app.service('automerge').create({
      name: 'user/testuser'
    })

    expect(info2.url).toEqual(info.url)

    const newDocument = await app.service('automerge').repo.find(info.url as AnyDocumentId)
    const newContents = newDocument.doc() as { todos: Record<string, Todo> }

    expect(newContents.todos).toBeDefined()
    expect(Object.values(newContents.todos).length).toBe(1)

    const todo2 = await app.service('todos').create({
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
        username: 'testuser'
      },
      {
        id: todo2.id,
        title: 'New test todo',
        completed: false,
        username: 'testuser'
      }
    ])

    await app.service('todos').remove(todo2.id)

    const latestContents = newDocument.doc() as { todos: Record<string, Todo> }

    expect(Object.values(latestContents.todos)).toEqual([
      {
        id: todo1.id,
        title: 'Updated test todo',
        completed: true,
        username: 'testuser'
      }
    ])
  })
})
