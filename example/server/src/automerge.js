import { automergeSyncServer, createAutomergeApp, createRepo, createWss } from 'feathers-automerge-server'

export async function automerge(app) {
  let repo

  // Use dynamic import for ESM compatibility
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
      create: async (context) => {
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
    setup: [async (context, next) => {
      const page = await app.service('sync').find()
      const syncs = page.data
      
      createAutomergeApp(app, repo, syncs)

      return next()
    }]
  })
}
