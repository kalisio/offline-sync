// For more information about this file see https://dove.feathersjs.com/guides/cli/application.html
import { feathers } from '@feathersjs/feathers'
import express, {
  rest,
  json,
  urlencoded,
  cors,
  serveStatic,
  notFound,
  errorHandler
} from '@feathersjs/express'
import configuration from '@feathersjs/configuration'
import socketio from '@feathersjs/socketio'
import { automergeServer } from '@kalisio/feathers-automerge-server'

import { logger } from './logger.js'
import { logError } from './hooks/log-error.js'
import { mongodb } from './mongodb.js'
import { services } from './services/index.js'
import { channels } from './channels.js'

const app = express(feathers())

// Load app configuration
app.configure(configuration())
app.use(cors())
app.use(json())
app.use(urlencoded({ extended: true }))
// Host the public folder
app.use('/', serveStatic(app.get('public')))

// Configure services and real-time functionality
app.configure(rest())
app.configure(
  socketio({
    cors: {
      origin: app.get('origins')
    }
  })
)
app.configure(mongodb)

app.configure(services)
// app.configure(
//   automergeServer({
//     directory: '../../data/automerge',
//     rootDocument: 'automerge:e4d1sGwWcYDE9Gg37fc1bpVTgzg',
//     serverId: 'test-server',
//     async initializeDocument(name, servicePath) {
//       if (name.startsWith('user') && servicePath === 'todos') {
//         const [, username] = name.split('/')
//         return app.service('todos').find({
//           paginate: false,
//           query: { username }
//         })
//       }

//       return []
//     },
//     async getDocumentNames(data, servicePath) {
//       if (servicePath === 'todos') {
//         return [`user/${data.username}`]
//       }

//       return []
//     }
//   })
// )
app.configure(channels)

// Configure a middleware for 404s and the error handler
app.use(notFound())
app.use(errorHandler({ logger }))

// Register hooks that run on all service methods
app.hooks({
  around: {
    all: [logError]
  },
  before: {},
  after: {},
  error: {}
})
// Register application setup and teardown hooks here
app.hooks({
  setup: [],
  teardown: []
})

export { app }
