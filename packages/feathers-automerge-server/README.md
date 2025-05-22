# feathers-automerge-server

Utilities to set up an automerge sync server that synchronizes documents with a Feathers API.

## Usage

In your Feathers application, create the following `src/automerge.ts`:

```ts
import {
  automergeSyncServer,
  createAutomergeApp,
  createRepo,
  createWss,
  SyncServiceSettings
} from 'feathers-automerge-server';
import { Application, HookContext, NextFunction } from './declarations';

export async function automerge(app: Application) {
  const wss = createWss();
  const repo = createRepo('../data', wss);

  app.configure(automergeSyncServer(wss));
  app.hooks({
    setup: [
      async (context: HookContext, next: NextFunction) => {
        const page = await context.app.service('sync').find();
        const syncs: SyncServiceSettings[] =
          page.total > 0
            ? page.data
            : [
                {
                  service: 'todos',
                  channel: 'default',
                  url: repo.create({}).url
                }
              ];
        const _automergeApp = createAutomergeApp(app, repo, syncs);
      }
    ]
  });
}
```

Then add it in `src/app.ts`:

```ts
import { automerge } from './automerge';

//...
app.configure(automerge);
```
