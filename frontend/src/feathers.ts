import { feathers, type Service } from '@feathersjs/feathers'
import socketio from '@feathersjs/socketio-client'
import io from 'socket.io-client'
import { AutomergeService, createBrowserRepo, type ServiceDataDocument } from 'feathers-automerge'
import { generateObjectId } from '../../feathers-automerge'

const SYNC_SERVER_URL = 'ws://localhost:5050' // 'wss://sync.automerge.org'
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

type Sync = { service: string, channel: string, url: string }

export const app = feathers<{ todos: TodoService, sync: Service<Sync> }>()
const socket = io(FEATHERS_SERVER_URL, { transports: ['websocket'] })

app.configure(socketio(socket))

export async function getApp() {
  if (!app._isSetup) {
    const syncs = (await app.service('sync').find()) as Sync[]
  
    for (const sync of syncs) {
      console.log('Registering automerge service', sync)
      const handle = repo.find<ServiceDataDocument<Todo>>(sync.url as any)
      const automergeService = new AutomergeService<Todo>(handle, {
        idGenerator: generateObjectId
      })
      app.use(sync.service as any, automergeService)
    }
  
    await app.setup()
  }

  return app
}
