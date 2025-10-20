import 'dotenv/config'
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
import { authentication } from './authentication.js'
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
app.configure(authentication)
app.configure(services)
app.configure(
  automergeServer({
    ...app.get('automerge'),
    async getAccessToken() {
      const response = await fetch('http://localhost:3030/authentication', {
        body: JSON.stringify({
          strategy: 'local',
          email: 'david@feathers.dev',
          password: 'test'
        }),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      })

      if (response.status >= 400) {
        console.error(await response.text())
        throw new Error('Failed to authenticate with remote sync server')
      }

      const { accessToken } = await response.json()
      return accessToken
    },
    async authenticate(app, accessToken) {
      if (!accessToken) {
        return false
      }

      await app.service('authentication').create({
        strategy: 'jwt',
        accessToken
      })

      return true
    },
    async initializeDocument(servicePath, query) {
      if (servicePath === 'todos') {
        return app.service('todos').find({
          paginate: false,
          query
        })
      }

      return null
    },
    async getDocumentsForData(servicePath, data, documents) {
      if (servicePath === 'todos') {
        return documents.filter(doc => !doc.query.username || data.username === doc.query.username)
      }

      return []
    },
    async canAccess() {
      return true
    }
  })
)
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
