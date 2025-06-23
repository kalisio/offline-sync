import { AnyDocumentId, Repo } from "@automerge/automerge-repo";
import { Application, feathers, NextFunction } from "@feathersjs/feathers";
import {
  AutomergeService,
  ServiceDataDocument,
} from "@kalisio/feathers-automerge";
import {
  BrowserWebSocketClientAdapter,
  NodeWSServerAdapter,
} from "@automerge/automerge-repo-network-websocket";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import { WebSocketServer } from "ws";
import os from "os";
import type { Server as HttpServer } from "http";

export type SyncServiceSettings = {
  service: string;
  url: string;
  idField?: string;
};

export type AutomergeApplication = Application<any, { repo: Repo }>;

export function initSyncService(
  sync: SyncServiceSettings,
  automergeApp: AutomergeApplication,
  serverApp: Application,
) {
  const handle = automergeApp
    .get("repo")
    .find<ServiceDataDocument<any>>(sync.url as AnyDocumentId);
  const automergeService = new AutomergeService<any>(handle, {
    idField: sync.idField,
  });
  const idField = sync.idField || "_id";

  console.log("Setting up automerge service", sync.service);
  automergeApp.use(sync.service, automergeService);

  automergeApp.service(sync.service).on("created", (data) => {
    console.log("Automerge app create", data);
    serverApp
      .service(sync.service)
      .create(data)
      .catch((e) => console.error(e));
  });

  automergeApp.service(sync.service).on("patched", (data) => {
    const { [idField]: _id, ...rest } = data;
    const id = _id.toString();
    console.log("Automerge app patch", rest);
    serverApp
      .service(sync.service)
      .patch(id, rest)
      .catch((e) => console.error(e));
  });

  automergeApp.service(sync.service).on("updated", (data) => {
    const { [idField]: _id, ...rest } = data;
    const id = _id.toString();
    console.log("Automerge app update", rest);
    serverApp
      .service(sync.service)
      .update(id, rest)
      .catch((e) => console.error(e));
  });

  automergeApp.service(sync.service).on("removed", (data) => {
    console.log("Automerge app remove", data);
    const id = data[idField].toString();
    serverApp
      .service(sync.service)
      .remove(id)
      .catch((e) => console.error(e));
  });

  serverApp.service(sync.service).on("created", async (data) => {
    console.log("Server create", data);

    const service = automergeApp.service(
      sync.service,
    ) as unknown as AutomergeService<unknown>;
    const doc = await service.handle.doc();
    const id = data[idField].toString();

    if (data && doc && !doc[id]) {
      automergeApp
        .service(sync.service)
        .create(data)
        .catch((e) => console.error(e));
    }
  });

  serverApp.service(sync.service).on("patched", async (data) => {
    const service = automergeApp.service(
      sync.service,
    ) as unknown as AutomergeService<unknown>;
    const doc = await service.handle.doc();
    const { [idField]: _id, ...payload } = data;
    const id = _id.toString();

    console.log("Server patch", payload);

    if (doc && doc[id]) {
      const docData = doc[id];
      // Check if doc[data._id] is different than data
      const isChanged = Object.keys(payload).some(
        (key) => docData[key] !== payload[key],
      );

      if (isChanged) {
        automergeApp
          .service(sync.service)
          .patch(id, payload)
          .catch((e) => console.error(e));
      }
    }
  });

  serverApp.service(sync.service).on("updated", async (data) => {
    const service = automergeApp.service(
      sync.service,
    ) as unknown as AutomergeService<unknown>;
    const doc = await service.handle.doc();
    const { [idField]: _id, ...payload } = data;
    const id = _id.toString();

    console.log("Server update", payload);

    if (doc && doc[id]) {
      const docData = doc[id];
      // Check if doc[data._id] is different than data
      const isChanged = Object.keys(payload).some(
        (key) => docData[key] !== payload[key],
      );

      if (isChanged) {
        automergeApp
          .service(sync.service)
          .update(id, payload)
          .catch((e) => console.error(e));
      }
    }
  });

  serverApp.service(sync.service).on("removed", async (data) => {
    const service = automergeApp.service(
      sync.service,
    ) as unknown as AutomergeService<unknown>;
    const doc = await service.handle.doc();
    const id = data[idField].toString();

    console.log("Server remove", data);

    if (doc && doc[id]) {
      automergeApp
        .service(sync.service)
        .remove(id)
        .catch((e) => console.error(e));
    }
  });
}

export async function createAutomergeApp(
  app: Application,
  repo: Repo,
  syncs: SyncServiceSettings[],
) {
  const automergeApp = feathers();

  automergeApp.set("repo", repo);

  syncs.forEach((sync) => initSyncService(sync, automergeApp, app));

  await automergeApp.setup();

  return automergeApp;
}

export function createRepo(
  dir: string,
  wss: WebSocketServer | string,
  hostname: string = os.hostname(),
) {
  if (typeof wss === "string") {
    return new Repo({
      network: [new BrowserWebSocketClientAdapter(wss)],
      storage: new NodeFSStorageAdapter(dir),
    });
  }

  return new Repo({
    network: [new NodeWSServerAdapter(wss as any)],
    storage: new NodeFSStorageAdapter(dir),
    /** @ts-ignore @type {(import("@automerge/automerge-repo").PeerId)}  */
    peerId: `storage-server-${hostname}` as PeerId,
    // Since this is a server, we don't share generously — meaning we only sync documents they already
    // know about and can ask for by ID.
    sharePolicy: async () => false,
  });
}

export function createWss() {
  return new WebSocketServer({ noServer: true });
}

export interface ServerOptions {
  syncServerUrl?: string;
  directory: string;
  document?: string;
  services: string[];
}

export function automergeServer() {
  return function (app: Application) {
    const options = app.get("automerge") as ServerOptions;

    if (!options) {
      throw new Error("automerge configuration must be set");
    }

    console.log("Automerge server configuration is", options);

    let repo;

    if (options.syncServerUrl) {
      // If we are connecting to another sync server, only create the repository
      repo = createRepo(options.directory, options.syncServerUrl);
    } else {
      const wss = createWss();
      repo = createRepo(options.directory, wss);

      app.hooks({
        setup: [
          async (context: { server: HttpServer }, next: NextFunction) => {
            context.server.on("upgrade", (request, socket, head) => {
              const pathname = new URL(
                request.url!,
                `http://${request.headers.host}`,
              ).pathname;

              if (pathname === "/") {
                wss.handleUpgrade(request, socket, head, (socket) => {
                  wss.emit("connection", socket, request);
                });
              }
            });

            return next();
          },
        ],
      });
    }

    const mainDoc = options.document
      ? repo.find<ServiceDataDocument<SyncServiceSettings>>(
          options.document as AnyDocumentId,
        )
      : repo.create<ServiceDataDocument<SyncServiceSettings>>();

    console.log(`Automerge main document is ${mainDoc.url}`);

    app.use(
      "automerge",
      new AutomergeService(mainDoc, {
        idField: "url",
      }),
    );

    const automergeService = app.service("automerge");

    if (!options.document) {
      const syncs = options.services.map((service) => {
        const doc = repo.create({
          service,
        });
        const url = doc.url;

        return {
          url,
          idField: "_id",
          service,
        };
      });
      syncs.forEach((sync) => automergeService.create(sync));
      createAutomergeApp(app, repo, syncs);
    } else {
      automergeService.find().then((page) => {
        const syncs = page.data;

        createAutomergeApp(app, repo, syncs);
      });
    }
  };
}
