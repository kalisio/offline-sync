// For more information about this file see https://dove.feathersjs.com/guides/cli/service.html

import { ObjectId } from 'mongodb'
import type { Application } from '../../declarations'
import { TodosService, getOptions } from './todos.class'

export const todosPath = 'todos'
export const todosMethods: Array<keyof TodosService> = ['find', 'get', 'create', 'patch', 'remove']

export * from './todos.class'

// A configure function that registers the service and its hooks via `app.configure`
export const todos = (app: Application) => {
  // Register our service on the Feathers application
  app.use(todosPath, new TodosService(getOptions(app)), {
    // A list of all methods this service exposes externally
    methods: todosMethods,
    // You can add additional custom events to be sent to clients here
    events: []
  })
  // Initialize hooks
  app.service(todosPath).hooks({
    around: {
      all: []
    },
    before: {
      all: [],
      find: [],
      get: [],
      create: [
        async (context) => {
          const { data } = context
          if (data._id) {
            data._id = new ObjectId(data._id)
            console.log(data.id)
          }
        }
      ],
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
    [todosPath]: TodosService
  }
}
