import type { DocHandle } from "@automerge/automerge-repo"

export type ServiceDataDocument<T> = {
  [key: string]: T & { id: string}
}

const CREATE_OR_PATCH = 6
const DELETE = 1

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
    this.handle.on('change', ({ patches, patchInfo }) => {
      const id = patches[0]?.path[0]

      if (!id) {
        return
      }

      if (patches.length === CREATE_OR_PATCH) {
        if (patchInfo.before[id]) {
          (this as any).emit('patched', patchInfo.after[id])
        } else {
          (this as any).emit('created', patchInfo.after[id])
        }
      }

      if (patches.length === DELETE) {
        (this as any).emit('removed', patchInfo.before[id])
      }
    })
  }
}
