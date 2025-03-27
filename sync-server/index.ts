// @ts-check
import fs from 'fs';
import os from 'os';
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Repo, AnyDocumentId } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import { feathers } from '@feathersjs/feathers'
import socketio from '@feathersjs/socketio-client'
import io from 'socket.io-client'
import { AutomergeService, ServiceDataDocument } from 'feathers-automerge';

const socket = io('http://localhost:3030')
const serverClient = feathers()

// Set up Socket.io client with the socket
serverClient.configure(socketio(socket))

export class Server {
  #socket: WebSocketServer;

  #server: ReturnType<express.Express['listen']>;

  #readyResolvers: ((value: boolean) => void)[] = [];

  #isReady = false;

  #repo: Repo;

  constructor() {
    const dir = '../data';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    var hostname = os.hostname();

    this.#socket = new WebSocketServer({ noServer: true });

    const PORT =
      process.env.PORT !== undefined ? parseInt(process.env.PORT) : 5050;

    const app = express();

    const config = {
      network: [new NodeWSServerAdapter(this.#socket)],
      storage: new NodeFSStorageAdapter(dir),
      /** @ts-ignore @type {(import("@automerge/automerge-repo").PeerId)}  */
      peerId: `storage-server-${hostname}` as PeerId,
      // Since this is a server, we don't share generously — meaning we only sync documents they already
      // know about and can ask for by ID.
      sharePolicy: async () => false
    };
    
    this.#repo = new Repo(config);

    app.get('/', (req, res) => {
      res.send(`👍 @automerge/example-sync-server is running`);
    });

    this.#server = http.createServer(app).listen(PORT, () => {
      console.log(`HTTP Server listening on port ${PORT}`);
      this.#isReady = true;
      this.#readyResolvers.forEach((resolve) => resolve(true));
    });

    this.#server.on('upgrade', (request, socket, head) => {
      this.#socket.handleUpgrade(request, socket, head, (socket) => {
        this.#socket.emit('connection', socket, request);
      });
    });

    this.setupSyncRepos()
  }

  async setupSyncRepos() {
    type SyncData = {
      data: { service: string, channel: string, url: string }[]
    }

    let { data: syncs }: SyncData = await serverClient.service('sync').find()

    await this.ready();

    if (syncs.length === 0) {
      syncs = [
        await serverClient.service('sync').create({
          service: 'todos',
          channel: 'default',
          url: this.#repo.create({}).url
        })
      ]
    }

    for (const sync of syncs) {
      const handle = this.#repo.find<ServiceDataDocument<any>>(sync.url as AnyDocumentId)
      const automergeService = new AutomergeService<any>(handle)
      const automergeApp = feathers().use(sync.service, automergeService)

      automergeApp.service(sync.service).on('created', todo => {
        // serverClient.service(sync.service).create(todo)
      })

      serverClient.service(sync.service).on('created', (todo) =>{
        automergeApp.service(sync.service).create(todo)
      })
      serverClient.service(sync.service).on('patched', (todo) => {
        automergeApp.service(sync.service).patch(todo._id, todo)
      })
      serverClient.service(sync.service).on('removed', (todo) => {
        automergeApp.service(sync.service).remove(todo._id)
      })

      await automergeApp.setup()
    }
  }

  async ready() {
    if (this.#isReady) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      this.#readyResolvers.push(resolve);
    });
  }

  close() {
    this.#socket.close();
    this.#server.close();
  }
}

new Server();
