// For more information about this file see https://dove.feathersjs.com/guides/cli/service.class.html#database-services
import type { Params } from '@feathersjs/feathers'
import { MongoDBService } from '@feathersjs/mongodb'
import type { MongoDBAdapterParams, MongoDBAdapterOptions } from '@feathersjs/mongodb'

import type { Application } from '../../declarations'

type Sync = any
type SyncData = any
type SyncPatch = any
type SyncQuery = any

export type { Sync, SyncData, SyncPatch, SyncQuery }

export interface SyncParams extends MongoDBAdapterParams<SyncQuery> {}

// By default calls the standard MongoDB adapter service methods but can be customized with your own functionality.
export class SyncService<ServiceParams extends Params = SyncParams> extends MongoDBService<
  Sync,
  SyncData,
  SyncParams,
  SyncPatch
> {}

export const getOptions = (app: Application): MongoDBAdapterOptions => {
  return {
    paginate: app.get('paginate'),
    Model: app.get('mongodbClient').then(db => db.collection('sync'))
  }
}
