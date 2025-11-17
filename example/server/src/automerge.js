import { automergeServer } from '@kalisio/feathers-automerge-server'

export function automerge(app) {
  const config = app.get('automerge')
  const baseOptions = {
    ...config,
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
  }

  // Options when running as a main sync server
  const syncServerOptions = {
    async authenticate(app, accessToken) {
      if (!accessToken) {
        return false
      }

      await app.service('authentication').create({
        strategy: 'jwt',
        accessToken
      })

      return true
    }
  }

  // Options for server to server sync with a remote server
  const serverToServerOptions = {
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
    async getInitialDocuments() {
      const accessToken = await serverToServerOptions.getAccessToken()
      const response = await fetch('http://localhost:3030/automerge', {
        body: JSON.stringify({
          query: {}
        }),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      })

      if (response.status >= 400) {
        console.error(await response.text())
        throw new Error('Could not fetch initial document data')
      }

      const documentInfo = await response.json()

      return [documentInfo]
    }
  }

  // Combined options, based on if syncServerUrl (for server to server sync) is set
  const options = {
    ...baseOptions,
    ...(baseOptions.syncServerUrl ? serverToServerOptions : syncServerOptions)
  }

  app.configure(automergeServer(options))
}
