# @kalisio/feathers-automerge-server

Package to set up an automerge sync server that synchronizes documents with a Feathers API.

## Usage

In your Feathers application, add the following to your `app` file:

```ts
import { automergeServer } from '@kalisio/feathers-automerge-server'

//...
app.configure(services)
app.configure(automergeServer({
  directory: '<directory for automerge data storage>',
  rootDocumentId: '<root document URL>',
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
}))
```

The following options are available:

- `directory`: The directory where the automerge repository data will be stored.
- `rootDocumentId`: The URL/ID of the root document that contains the list of all synchronized documents.
- `serverId`: A unique identifier for this server instance (used to track data source).
- `syncServicePath`: The service path where the automerge sync service will be mounted (e.g., 'automerge').
- `syncServerUrl` (optional): URL of an external automerge sync server to connect to. If not provided, a local WebSocket server will be created.
- `initializeDocument`: An async function that initializes document data for a given service path and query. Called when creating new documents.
  - Parameters: `servicePath` (string), `query` (Query object), `documents` (array of existing SyncServiceInfo)
  - Returns: Promise<unknown[]> - Array of initial data for the service
- `getDocumentsForData`: An async function that determines which documents should be updated when service data changes.
  - Parameters: `servicePath` (string), `data` (the changed data), `documents` (array of SyncServiceInfo)
  - Returns: Promise<SyncServiceInfo[]> - Array of documents that should receive the update
