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
    }
  })
)
```

The following options are available:

- `directory: string`: The directory where the automerge repository data will be stored.
- `rootDocumentId: string`: The URL/ID of the root document that contains the list of all synchronized documents. See [initialization](#initialization) how to create it.
- `serverId: string`: A unique identifier for this server instance (used to track data source).
- `syncServicePath`: The service path where the automerge sync service will be mounted (e.g., 'automerge').
- `syncServerWsPath?: string`: The websocket path for the local sync server
- `authenticate?: (accessToken: string | null) => Promise<boolean>`: Authenticate an access token that was passed to the connection of the local sync server.
- `syncServerUrl?: string`: Connect to another remote sync server instead (for server to server synchronization)
- `getAccessToken?: () => Promise<string>`: Get an access token for the remote sync server.
- `initializeDocument`: An async function that initializes document data for a given service path and query. Called when creating new documents.
  - Parameters: `servicePath` (string), `query` (Query object), `documents` (array of existing SyncServiceInfo)
  - Returns: Promise<unknown[]> - Array of initial data for the service
- `getDocumentsForData`: An async function that determines which documents should be updated when service data changes.
  - Parameters: `servicePath` (string), `data` (the changed data), `documents` (array of SyncServiceInfo)
  - Returns: Promise<SyncServiceInfo[]> - Array of documents that should receive the update

## Initialization

To initialise the root document, create the following `initialize.ts` in your server  main directory:

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

This file can be run directly and will output the URL that can be set as `rootDocumentId` in the configuration.
