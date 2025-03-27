import { Application } from '@feathersjs/feathers'
import { AutomergeService, ServiceDataDocument } from '../frontend/src/feathers/offline'
import type { DocHandle } from '@automerge/automerge-repo'

export class SyncService<T> {
  private automergeService: AutomergeService<T>
  private feathersService: any
  private syncing = false
  private lastSync: Date | null = null

  constructor(automergeService: AutomergeService<T>, feathersApp: Application, servicePath: string) {
    this.automergeService = automergeService
    this.feathersService = feathersApp.service(servicePath)
    
    // Listen to Automerge changes
    this.automergeService.handle.on('change', async ({ patchInfo }) => {
      if (this.syncing) return // Skip if we're currently syncing from server
      
      const { before, after } = patchInfo
      const changes = this.diffObjects(before, after)
      
      await this.pushChangesToServer(changes)
    })

    // Listen to Feathers real-time events
    this.feathersService.on('created', async (data: T) => {
      if (this.syncing) return
      await this.pullChangeFromServer('created', data)
    })

    this.feathersService.on('patched', async (data: T) => {
      if (this.syncing) return
      await this.pullChangeFromServer('patched', data)
    })

    this.feathersService.on('removed', async (data: T) => {
      if (this.syncing) return
      await this.pullChangeFromServer('removed', data)
    })
  }

  private diffObjects(before: ServiceDataDocument<T>, after: ServiceDataDocument<T>) {
    const changes: Array<{ type: 'created' | 'patched' | 'removed', data: T }> = []
    
    // Check for created and patched
    for (const [id, afterData] of Object.entries(after)) {
      if (!before[id]) {
        changes.push({ type: 'created', data: afterData })
      } else if (JSON.stringify(before[id]) !== JSON.stringify(afterData)) {
        changes.push({ type: 'patched', data: afterData })
      }
    }
    
    // Check for removed
    for (const id of Object.keys(before)) {
      if (!after[id]) {
        changes.push({ type: 'removed', data: before[id] })
      }
    }
    
    return changes
  }

  private async pushChangesToServer(changes: Array<{ type: string, data: T }>) {
    this.syncing = true
    try {
      for (const change of changes) {
        const { type, data } = change
        const { id } = data as any

        switch (type) {
          case 'created':
            await this.feathersService.create(data)
            break
          case 'patched':
            await this.feathersService.patch(id, data)
            break
          case 'removed':
            await this.feathersService.remove(id)
            break
        }
      }
    } finally {
      this.syncing = false
    }
  }

  private async pullChangeFromServer(type: 'created' | 'patched' | 'removed', data: T) {
    this.syncing = true
    try {
      const { id } = data as any
      
      switch (type) {
        case 'created':
          await this.automergeService.create(data)
          break
        case 'patched':
          await this.automergeService.patch(id, data)
          break
        case 'removed':
          await this.automergeService.remove(id)
          break
      }
    } finally {
      this.syncing = false
    }
  }

  async syncFromServer() {
    this.syncing = true
    try {
      // Get all data from server
      const serverData = await this.feathersService.find()
      const localData = await this.automergeService.find()
      
      // Create a map of local data by ID
      const localDataMap = new Map(localData.map(item => [(item as any).id, item]))
      
      // Update or create items from server
      for (const serverItem of serverData.data) {
        const { id } = serverItem
        if (!localDataMap.has(id)) {
          await this.automergeService.create(serverItem)
        } else {
          await this.automergeService.patch(id, serverItem)
        }
        localDataMap.delete(id)
      }
      
      // Remove local items that don't exist on server
      for (const [id] of localDataMap) {
        await this.automergeService.remove(id)
      }
      
      this.lastSync = new Date()
    } finally {
      this.syncing = false
    }
  }

  getLastSyncTime() {
    return this.lastSync
  }
}
