// For more information about this file see https://dove.feathersjs.com/guides/cli/service.class.html#database-services
import type { Params } from '@feathersjs/feathers'
import { MongoDBService } from '@feathersjs/mongodb'
import type { MongoDBAdapterParams, MongoDBAdapterOptions } from '@feathersjs/mongodb'

import type { Application } from '../../declarations'

type Todos = any
type TodosData = any
type TodosPatch = any
type TodosQuery = any

export type { Todos, TodosData, TodosPatch, TodosQuery }

export interface TodosParams extends MongoDBAdapterParams<TodosQuery> {}

// By default calls the standard MongoDB adapter service methods but can be customized with your own functionality.
export class TodosService<ServiceParams extends Params = TodosParams> extends MongoDBService<
  Todos,
  TodosData,
  TodosParams,
  TodosPatch
> {}

export const getOptions = (app: Application): MongoDBAdapterOptions => {
  return {
    paginate: app.get('paginate'),
    Model: app.get('mongodbClient').then(db => db.collection('todos'))
  }
}
