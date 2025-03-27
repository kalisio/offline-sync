import { feathers } from '@feathersjs/feathers'
import { AutomergeService, createBrowserRepo, type ServiceDataDocument } from 'feathers-automerge'

const SYNC_SERVER_URL = 'ws://localhost:5050' // 'wss://sync.automerge.org'

export type Todo = {
  title: string;
  completed: boolean;
}

export type TodoItem = Todo & {
  id: string
}

const repo = createBrowserRepo(SYNC_SERVER_URL)

function getHandle() {
  if (window.location.hash) {
    return repo.find<ServiceDataDocument<Todo>>((window.location as any).hash.slice(1));
  } else {
    const newRepo = repo.create<ServiceDataDocument<Todo>>({});
    window.location.hash = newRepo.url;
    return newRepo
  }
}

const handle = getHandle()

type TodoService = AutomergeService<Todo>

export const app = feathers<{ todos: TodoService }>()
  .use('todos', new AutomergeService<Todo>(handle))

app.setup()
