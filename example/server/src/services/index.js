import { user } from './users/users.js'
import { todos } from './todos/todos.js'

export const services = app => {
  app.configure(user)
  app.configure(todos)
  // All services will be registered here
}
