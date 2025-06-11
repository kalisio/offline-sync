import { TodosService, getOptions } from './todos.class.js'
import { toObjectId } from '../../hooks/to-objectid.js'

export const todosPath = 'todos'
export const todosMethods = ['find', 'get', 'create', 'patch', 'remove']

export * from './todos.class.js'

// A configure function that registers the service and its hooks via `app.configure`
export const todos = app => {
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
      create: [toObjectId],
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
