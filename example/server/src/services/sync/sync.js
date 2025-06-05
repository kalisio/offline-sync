import { SyncService, getOptions } from './sync.class.js'

export const syncPath = 'sync'
export const syncMethods = ['find', 'get', 'create', 'patch', 'remove']

export * from './sync.class.js'

// A configure function that registers the service and its hooks via `app.configure`
export const sync = app => {
  // Register our service on the Feathers application
  app.use(syncPath, new SyncService(getOptions(app)), {
    // A list of all methods this service exposes externally
    methods: syncMethods,
    // You can add additional custom events to be sent to clients here
    events: []
  })
  // Initialize hooks
  app.service(syncPath).hooks({
    around: {
      all: []
    },
    before: {
      all: [],
      find: [],
      get: [],
      create: [],
      patch: [],
      remove: []
    },
    after: {
      all: []
    },
    error: {
      all: []
    }
  })
}
