import { AutomergeUrl } from '@automerge/automerge-repo'
import { PaginationParams } from '@feathersjs/feathers'

export interface Query {
  [key: string]: any
}

export type SyncServiceInfo = {
  url: AutomergeUrl
  query: Query
}

export type SyncServiceCreate = {
  query: Query
}

export type SyncServiceDocument = Record<string, Record<string, unknown>> & {
  __meta: Record<string, { idField: string, paginate: PaginationParams }>
}

// MongoDB ObjectId-like generator
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0')
  const machineId = Math.floor(Math.random() * 16777216)
    .toString(16)
    .padStart(6, '0')
  const processId = Math.floor(Math.random() * 65536)
    .toString(16)
    .padStart(4, '0')
  const counter = Math.floor(Math.random() * 16777216)
    .toString(16)
    .padStart(6, '0')

  return timestamp + machineId + processId + counter
}

// UUID generator (wrapper around crypto.randomUUID)
export function generateUUID(): string {
  return crypto.randomUUID()
}
