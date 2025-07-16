import { createRootDocument } from '@kalisio/feathers-automerge-server'

createRootDocument('../../data/automerge').then(doc => {
  console.log(doc.url)
})
