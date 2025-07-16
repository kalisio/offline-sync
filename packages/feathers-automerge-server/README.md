# @kalisio/feathers-automerge-server

Utilities to set up an automerge sync server that synchronizes documents with a Feathers API.

## Usage

In your Feathers application, add the following to your `app` file:

```ts
import { automergeServer } from '@kalisio/feathers-automerge-server'

//...
app.configure(services)
// This must be after your services are configured
app.configure(automergeServer({
  directory,
  rootDocumentId,
  serverId,
  async initializeDocument(name: string, servicePath: string) {
    return []
  },
  async getDocumentNames(data: unknown, servicePath: string) {
    return []
  }
}))
```

The following options are available:

- `directory`: The directory where the automerge repository will be stored.
- `rootDocumentId`: The root document id that stores information about the available documents. Use `createRootDocument` to initialize a new one.
- `syncServicePath`: The service path where the sync service is registered.
- `syncServerUrl`: Set this, if this server should not act as a sync server but instead synchronize with an existing other server.
- `serverId`: A unique identifier for this server.
- `initializeDocument(documentName, servicePath)`: For a given document name and service path, get the initial data for a new document.
- `getDocumentNames(data, servicePath)`: For the given data and service path, return a list of document names the data can belong to.
