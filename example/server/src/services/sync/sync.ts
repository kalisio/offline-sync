// For more information about this file see https://dove.feathersjs.com/guides/cli/service.html

import type { Application } from '../../declarations'
import { SyncService, getOptions } from './sync.class'

export const syncPath = 'sync'
export const syncMethods: Array<keyof SyncService> = ['find', 'get', 'create', 'patch', 'remove']

export * from './sync.class'

// A configure function that registers the service and its hooks via `app.configure`
export const sync = (app: Application) => {
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

// Add this service to the service type index
declare module '../../declarations' {
  interface ServiceTypes {
    [syncPath]: SyncService
  }
}
