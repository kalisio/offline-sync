import type { AnyDocumentId, DocHandle } from "@automerge/automerge-repo"
import { Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'

export type ServiceDataDocument<T> = {
  [key: string]: T & { id: string }
}

export class AutomergeService<T> {
  events = ['created', 'patched', 'removed']
  handle: DocHandle<ServiceDataDocument<T>>

  constructor(handle: DocHandle<ServiceDataDocument<T>>) {
    this.handle = handle
  }

  async get(id: string) {
    const doc = await this.handle.doc()

    if (!doc || !doc[id]) {
      throw new Error(`Item ${id} not found`)
    }

    return doc[id]
  }

  async create(data: T) {
    const id = crypto.randomUUID()
    const item = {
      id,
      ...data
    }

    this.handle.change((doc) => {
      doc[id] = item
    })

    return item
  }

  async patch(id: string, data: Partial<T>) {
    const item = await this.get(id)
    const patched = {
      ...item,
      ...data
    }

    this.handle.change((doc) => {
      doc[id] = patched
    })

    return patched
  }

  async remove(id: string) {
    const doc = await this.handle.doc()

    if (!doc || !doc[id]) {
      throw new Error(`Item ${id} not found`)
    }

    const removed = doc[id]

    this.handle.change((doc) => {
      delete doc[id]
    })

    return removed
  }

  async find() {
    const doc = await this.handle.doc()

    if (!doc) {
      throw new Error('Document not loaded')
    }

    return Object.values(doc)
  }

  setup() {
    this.handle.on('change', ({ patches, patchInfo,  }) => {
      const { before, after } = patchInfo

      if (Object.keys(before).length === 0) {
        return
      }

      const ids = new Set(patches.map((patch) => patch.path[0]))

      for (const id of ids) {
        if (!before[id]) {
          (this as any).emit('created', after[id])
        } else if (!after[id]) {
          (this as any).emit('removed', before[id])
        } else if (before[id]) {
          (this as any).emit('patched', after[id])
        }
      }
    })
  }
}

export function createBrowserRepo(wsUrl: string) {
  return new Repo({
    network: [new BrowserWebSocketClientAdapter(wsUrl)],
    storage: new IndexedDBStorageAdapter()
  })
}

export function getDocumentHandle<T>(repo: Repo, docId?: AnyDocumentId) {
  if (docId) {
    return repo.find<ServiceDataDocument<T>>(docId);
  }
  
  return repo.create<ServiceDataDocument<T>>({});
}
