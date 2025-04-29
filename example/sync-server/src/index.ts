import { feathers } from '@feathersjs/feathers'
import express, {
  rest,
  json,
  urlencoded,
  cors,
  notFound,
  errorHandler
} from '@feathersjs/express'
import { automerge } from './automerge'

const app = express(feathers())

app.use(cors())
app.use(json())
app.use(urlencoded({ extended: true }))

// Configure services and real-time functionality
app.configure(rest())

app.configure(automerge)

app.use(notFound())
app.use(errorHandler())

app.listen(4040).then(() => console.log('Sync Feathers app listening on port 4040'))
