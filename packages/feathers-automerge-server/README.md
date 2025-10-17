# @kalisio/feathers-automerge-server

Package to set up an automerge sync server that synchronizes documents with a Feathers API.

## Usage

In your Feathers application, add the following to your `app` file:

```ts
import { automergeServer } from '@kalisio/feathers-automerge-server'

//...
app.configure(services)
app.configure(
  automergeServer({
    ...app.get('automerge'),
    async getAccessToken() {
      const response = await fetch('http://localhost:3030/authentication', {
        body: JSON.stringify({
          strategy: 'local',
          email: 'david@feathers.dev',
          password: 'test'
        }),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const { accessToken } = await response.json()
      return accessToken
    },
    async authenticate(accessToken) {
      if (!accessToken) {
        return false
      }

      await app.service('authentication').create({
        strategy: 'jwt',
        accessToken
      })

      return true
    },
    async initializeDocument(servicePath, query) {
      if (servicePath === 'todos') {
        const { username } = query
        return app.service('todos').find({
          paginate: false,
          query: { username }
        })
      }

      return null
    },
    async getDocumentsForData(servicePath, data, documents) {
      if (servicePath === 'todos') {
        return documents.filter(doc => data.username === doc.query.username)
      }

      return []
    },
    async canAccess(query, user) {
      // Only allow access to documents where the query username matches the authenticated user
      return query.username === user?.username
    }
  })
)
```

The following options are available:

- `directory: string`: The directory where the automerge repository data will be stored. The root document ID will be automatically stored in a `root-document.json` file in this directory.
- `serverId: string`: A unique identifier for this server instance (used to track data source).
- `syncServicePath`: The service path where the automerge sync service will be mounted (e.g., 'automerge').
- `syncServerWsPath?: string`: The websocket path for the local sync server
- `authenticate: (accessToken: string | null) => Promise<boolean>`: Authenticate an access token that was passed to the connection of the local sync server.
- `syncServerUrl?: string`: Connect to another remote sync server instead (for server to server synchronization)
- `getAccessToken?: () => Promise<string>`: Get an access token for the remote sync server.
- `canAccess: (query: Query, params: Params) => Promise<boolean>`: An async function that controls access to documents based on the query and service call params. Called for all operations when a `provider` is present in params (external calls).
- `initializeDocument`: An async function that initializes document data for a given service path and query. Called when creating new documents.
  - Parameters: `servicePath` (string), `query` (Query object), `documents` (array of existing SyncServiceInfo)
  - Returns: Promise<unknown[]> - Array of initial data for the service
- `getDocumentsForData`: An async function that determines which documents should be updated when service data changes.
  - Parameters: `servicePath` (string), `data` (the changed data), `documents` (array of SyncServiceInfo)
  - Returns: Promise<SyncServiceInfo[]> - Array of documents that should receive the update

## Initialization

The root document is automatically created and stored when the automerge server starts for the first time. The root document ID is saved in a `root-document.json` file in the specified `directory` option. If you need to manually create a root document for testing or initialization purposes, you can use the `createRootDocument` function:

```ts
import { createRootDocument } from '@kalisio/feathers-automerge-server'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const directory = path.join(__dirname, '..', '..', 'data', 'automerge')

createRootDocument(directory).then(doc => {
  console.log(doc.url)
})
```
