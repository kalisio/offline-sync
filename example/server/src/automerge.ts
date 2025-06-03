import { automergeSyncServer, createAutomergeApp, createRepo, createWss, SyncServiceSettings } from 'feathers-automerge-server'
import { Application, HookContext, NextFunction } from '../../server/src/declarations';
import { Repo } from '@automerge/automerge-repo';

export async function automerge(app: Application) {
  let repo: Repo

  if (process.env.SYNC_SERVER_URL) {
    // If we are connecting to another sync server, only create the repository
    repo = createRepo('../data', process.env.SYNC_SERVER_URL!)
  } else {
    const wss = createWss();
    repo = createRepo('../data', wss)
    app.configure(automergeSyncServer(wss))
  }


  app.service('sync').hooks({
    before: {
      create: async (context: HookContext) => {
        const { data } = context
        
        if(!data.url) {
          data.url = repo.create({}).url
        }
      }
    }
  })

  app.service('sync').on('created', sync => {
    createAutomergeApp(app, repo, [sync])
  })

  app.hooks({
    setup: [async (context: HookContext, next: NextFunction) => {
      const page = await app.service('sync').find()
      const syncs: SyncServiceSettings[] = page.data
      
      createAutomergeApp(app, repo, syncs)

      return next()
    }]
  })
}
