import { sync } from './sync/sync.js'
import { todos } from './todos/todos.js'
export const services = app => {
  app.configure(sync)

  app.configure(todos)

  // All services will be registered here
}
