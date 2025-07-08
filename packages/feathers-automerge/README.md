# @kalisio/feathers-automerge

A Feathers service implementation for the Automerge CRDT

## Initialization

With a @kalisio/feathers-automerge-server set up, the Automerge client can be used like this:

```ts
import { feathers } from "@feathersjs/feathers";
import socketio from "@feathersjs/socketio-client";
import io from "socket.io-client";
import { automergeClient, AutomergeService, syncOffline } from "@kalisio/feathers-automerge";

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

export async function useOffline(documentName: string) {
  return syncOffline(app, documentName)
}

useOffline('user/<userId>', {
  todos: {

  },
  map: {

  }
})
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
});

app.use('todos', automergeService);
```
