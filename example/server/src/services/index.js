import { todos } from './todos/todos.js'

export const services = app => {
  app.configure(todos)

  // All services will be registered here
}
