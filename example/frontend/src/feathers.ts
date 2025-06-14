import { feathers } from '@feathersjs/feathers'
import socketio from '@feathersjs/socketio-client'
import io from 'socket.io-client'
import { AutomergeService, createBrowserRepo, generateObjectId, type ServiceDataDocument } from 'feathers-automerge'

const SYNC_SERVER_URL = 'ws://localhost:4040' // 'wss://sync.automerge.org'
const FEATHERS_SERVER_URL = 'http://localhost:3030'

export type Todo = {
  title: string;
  completed: boolean;
}

export type TodoItem = Todo & {
  _id: string
}

const repo = createBrowserRepo(SYNC_SERVER_URL)

type TodoService = AutomergeService<Todo>

export const app = feathers<{ todos: TodoService, sync: any }>()
const socket = io(FEATHERS_SERVER_URL, { transports: ['websocket'] })

app.configure(socketio(socket))

export async function getApp() {
  if (!app._isSetup) {
    const { data: syncs } = await app.service('sync').find()
  
    for (const sync of syncs) {
      console.log('Registering automerge service', sync)
      const handle = repo.find<ServiceDataDocument<Todo>>(sync.url as any)
      const automergeService = new AutomergeService<Todo>(handle, {
        idField: '_id',
        idGenerator: generateObjectId
      })
      app.use(sync.service as any, automergeService)
    }
  
    await app.setup()
  }

  return app
}
