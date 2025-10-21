# @kalisio/feathers-automerge

A Feathers service implementation for the Automerge CRDT

## AutomergeService

This package comes with a service implementation backed by an Automerge document.

```ts
import { feathers } from '@feathersjs/feathers'
import { AutomergeService, generateObjectId } from '@kalisio/feathers-automerge'

// Set when configuring the automergeClient
const repo = app.get('repo')
// Get a handle to a document that should be used for this service
const handle = repo.find('automerge:2f9')

const app = feathers<{ todos: AutomergeService<Todo> }>()

const automergeTodoService = new AutomergeService<Todo>(handle, {
  idField: '_id',
  idGenerator: generateObjectId,
})

app.use('todos', automergeTodoService)

// Event will be triggered whenever anybody creates a new todo
app.service('todos').on('created', (todo) => {
  console.log(`Todo ${todo._id} created`)
})

app.service('todos').create({
  title: 'Learn Automerge',
  completed: false
})

console.log(await app.service('todos').find())
```

## Offline-first configuration

With a `@kalisio/feathers-automerge-server` set up, the Automerge client can be used like this:

```ts
import { feathers } from '@feathersjs/feathers'
import socketio from '@feathersjs/socketio-client'
import io from 'socket.io-client'
import {
  automergeClient,
  AutomergeService,
  stopSyncOffline,
  syncOffline,
  type Query
} from '@kalisio/feathers-automerge'

const FEATHERS_SERVER_URL = 'http://localhost:3030'

export const app = feathers()

const socket = io(FEATHERS_SERVER_URL, { transports: ['websocket'] })

app.configure(socketio(socket))
app.configure(
  automergeClient({
    syncServerUrl: FEATHERS_SERVER_URL,
    syncServicePath: 'automerge'
  })
)

export async function getApp() {
  if (!app._isSetup) {
    await app.setup()
  }

  return app
}

export async function useOffline(query: Query) {
  const app = await getApp()

  return syncOffline(app, { query })
}

export async function stopOffline() {
  const app = await getApp()

  return stopSyncOffline(app)
}
```

### Configuration Options

The `automergeClient` function accepts the following options:

- `syncServerUrl`: The URL of the automerge sync server (usually the same as your Feathers server)
- `syncServicePath`: The path where the automerge sync service is mounted (default: 'automerge')
- `authentication`: Set to `true` if Feathers authentication is set up. This will wait for the `login` event and then establish an authenticated connection with the sync server.

### Offline Synchronization

Use `syncOffline` to create an offline-capable document synchronized with the server:

```ts
// Start offline sync with a query
const offlineDoc = await useOffline({ username: 'john' })

// Stop offline sync
await stopOffline()
```
