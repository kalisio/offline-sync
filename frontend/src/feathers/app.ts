import { feathers } from '@feathersjs/feathers'
import { Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { AutomergeService, type ServiceDataDocument } from './offline'

const SYNC_SERVER_URL = 'wss://sync.automerge.org' // 'ws://localhost:5050'

export type Todo = {
  title: string;
  completed: boolean;
}

export type TodoItem = Todo & {
  id: string
}

function getHandle() {
  if (window.location.hash) {
    return repo.find<ServiceDataDocument<Todo>>((window.location as any).hash.slice(1));
  } else {
    const newRepo = repo.create<ServiceDataDocument<Todo>>({});
    window.location.hash = newRepo.url;
    return newRepo
  }
}

const repo = new Repo({
  network: [new BrowserWebSocketClientAdapter(SYNC_SERVER_URL)],
  storage: new IndexedDBStorageAdapter()
})
const handle = getHandle()

type TodoService = AutomergeService<Todo>

export const app = feathers<{ todos: TodoService }>()
  .use('todos', new AutomergeService<Todo>(handle))

app.setup()
