import { feathers } from '@feathersjs/feathers'
import socketio from '@feathersjs/socketio-client'
import io from 'socket.io-client'
import {
  automergeClient,
  AutomergeService,
  stopSyncOffline,
  syncOffline,
  type Query
} from '@kalisio/feathers-automerge'

const FEATHERS_SERVER_URL = (import.meta.env.VITE_FEATHERS_SERVER_URL as string) || 'http://localhost:3030'

export interface Todo {
  title: string
  completed: boolean
  username?: string
}

export type TodoItem = Todo & {
  _id: string
}

type TodoService = AutomergeService<Todo>

export const app = feathers<{ todos: TodoService; automerge: any }>()
const socket = io(FEATHERS_SERVER_URL, { transports: ['websocket'] })

app.configure(socketio(socket))
app.configure(
  automergeClient({
    syncServerUrl: FEATHERS_SERVER_URL,
    syncServicePath: 'automerge'
  })
)

export async function getApp() {
  if (!app._isSetup) {
    await app.setup()
  }

  return app
}

export async function useOffline(query: Query) {
  const app = await getApp()

  return syncOffline(app, { query })
}

export async function stopOffline() {
  const app = await getApp()

  return stopSyncOffline(app)
}
