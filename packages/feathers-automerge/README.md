# @kalisio/feathers-automerge

A Feathers service implementation for the Automerge CRDT

## Initialization

With a @kalisio/feathers-automerge-server set up, the Automerge client can be used like this:

```ts
import { feathers } from "@feathersjs/feathers";
import socketio from "@feathersjs/socketio-client";
import io from "socket.io-client";
import { automergeClient, AutomergeService } from "@kalisio/feathers-automerge";

const FEATHERS_SERVER_URL = "http://localhost:3030";
// In a default setup the sync server is the same as the Feathers server
const SYNC_SERVER_URL = "http://localhost:3030";

export const app = feathers();
const socket = io(FEATHERS_SERVER_URL, { transports: ["websocket"] });

app.configure(socketio(socket));
app.configure(automergeClient(SYNC_SERVER_URL));

// Use this asynchronously (to make sure everything is initialized)
export async function getApp() {
  if (!app._isSetup) {
    await app.setup();
  }

  return app;
}
```

### AutomergeService

This package also comes with a service implementation backed by an Automerge document.

```ts
import { AutomergeService, generateObjectId } from "@kalisio/feathers-automerge";

// Set when configuring the automergeClient
const repo = app.get('repo')
// Get a handle to a document that should be used for this service
const handle = repo.find('automerge:2f9')

const automergeTodoService = new AutomergeService<Todo>(handle, {
  idField: '_id',
  idGenerator: generateObjectId,
  dataField: 'data', // Optional: customize the field name where records are stored (default: 'data')
});

app.use('todos', automergeService);
```

#### Options

- `idField` (string): The field name to use as the primary key (default: 'id')
- `idGenerator` (function): Function to generate IDs for new records (default: generateUUID)
- `dataField` (string): The field name in the document where records are stored (default: 'data')
- `matcher`: Query matching function (default: sift)
- `sorter`: Sorting function (default: feathers sorter)

#### Custom Data Field

By default, the AutomergeService stores records in a `data` field within the document. You can customize this field name:

```ts
// Document structure will be: { service: 'todos', records: { ... } }
const automergeTodoService = new AutomergeService<Todo>(handle, {
  dataField: 'records'
});
```
