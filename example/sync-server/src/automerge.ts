import { automergeSyncServer, createAutomergeApp, createRepo, createWss, SyncServiceSettings } from 'feathers-automerge-server'
import { Application, HookContext, NextFunction } from '../../server/src/declarations';
import socketio from '@feathersjs/socketio-client'
import io from 'socket.io-client'
import { feathers } from '@feathersjs/feathers';

const socket = io('http://localhost:3030', {
  transports: ['websocket']
})
const serverClient = feathers()

serverClient.configure(socketio(socket))

export async function automerge(app: Application) {
  const wss = createWss()
  const repo = createRepo('../data', wss)

  app.configure(automergeSyncServer(wss))

  app.hooks({
    setup: [async (context: HookContext, next: NextFunction) => {
      const page = await serverClient.service('sync').find()
      const syncs: SyncServiceSettings[] = page.total > 0 ? page.data : [{
        service: 'todos',
        channel: 'default',
        url: repo.create({}).url
      }]
      const _automergeApp = createAutomergeApp(serverClient, repo, syncs)

      return next()
    }]
  })
}
