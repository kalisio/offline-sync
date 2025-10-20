import { Application } from '@feathersjs/feathers'

export class WrapperClientService {
  constructor(name: string) {}

  async create(data: any): Promise<any> {
    return this.client.create(data)
  }

  async get(id: string): Promise<any> {
    return this.client.get(id)
  }

  async update(id: string, data: any): Promise<any> {
    return this.client.update(id, data)
  }

  async patch(id: string, data: any): Promise<any> {
    return this.client.patch(id, data)
  }

  async remove(id: string): Promise<any> {
    return this.client.remove(id)
  }
}

export function wrapper(app: Application) {
  const originalDefaultService = app.defaultService

  app.defaultService = function (this: Application, name: string) {
    const originalService = originalDefaultService.call(this, name)
    return new WrapperClientService(name, originalService)
  }
}
