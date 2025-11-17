import { getInitialDocuments } from '@kalisio/feathers-automerge-server'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const directory = path.join(__dirname, '..', '..', 'data', 'automerge')

getInitialDocuments(directory).then(doc => {
  console.log(doc.url)
})
