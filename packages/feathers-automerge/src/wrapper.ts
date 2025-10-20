import { Application, Params, Paginated, Service } from '@feathersjs/feathers'
import { AutomergeClientApp, AutomergeService } from './index.js'

export class WrapperClientService {
  public automergeService?: AutomergeService<any>

  constructor(
    public app: AutomergeClientApp,
    public path: string,
    public clientService: Service
  ) {}

  private async route(method: keyof Service, ...args: any[]) {
    const syncHandle = await this.app.get('syncHandle')

    if (syncHandle === null) {
      delete this.automergeService
    }

    if (!this.automergeService && syncHandle !== null) {
      const doc = syncHandle.doc()

      if (doc[this.path]) {
        this.automergeService = new AutomergeService(syncHandle, {
          path: this.path
        })
      }
    }

    if (this.automergeService) {
      return (this.automergeService as any)[method](...args)
    }

    return (this.clientService[method] as any)(...args)
  }

  async find(params?: Params): Promise<any[] | Paginated<any>> {
    return this.route('find', params)
  }

  async create(data: any, params?: Params): Promise<any> {
    return this.route('create', data, params)
  }

  async get(id: string, params?: Params): Promise<any> {
    return this.route('get', id, params)
  }

  async update(id: string, data: any, params?: Params): Promise<any> {
    return this.route('update', id, data, params)
  }

  async patch(id: string | null, data: any, params?: Params): Promise<any> {
    return this.route('patch', id, data, params)
  }

  async remove(id: string | null, params?: Params): Promise<any> {
    return this.route('remove', id, params)
  }
}

export function serviceWrapper(app: Application) {
  const originalDefaultService = app.defaultService

  app.defaultService = function (this: Application, name: string) {
    const originalService = originalDefaultService.call(this, name)
    return new WrapperClientService(this, name, originalService as Service)
  }
}
