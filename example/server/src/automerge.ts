import { automergeSyncServer, createAutomergeApp, createRepo, createWss, SyncServiceSettings } from 'feathers-automerge-server'
import { Application, HookContext, NextFunction } from '../../server/src/declarations';

export async function automerge(app: Application) {
  const wss = process.env.SYNC_SERVER_URL ? process.env.SYNC_SERVER_URL! : createWss()
  const repo = createRepo('../data', wss)

  app.configure(automergeSyncServer(wss))

  app.hooks({
    setup: [async (context: HookContext, next: NextFunction) => {
      const page = await app.service('sync').find()
      const syncs: SyncServiceSettings[] = page.total > 0 ? page.data : [await app.service('sync').create({
        service: 'todos',
        channel: 'default',
        url: repo.create({}).url
      })]
      const _automergeApp = createAutomergeApp(app, repo, syncs)

      return next()
    }]
  })
}
