# feathers-automerge-server

Utilities to set up an automerge sync server that synchronizes documents with a Feathers API.

## Usage

In your Feathers application, add the following to your `app` file:

```ts
import { automergeServer } from 'feathers-automerge-server'

//...
app.configure(services)
// This must be after your services are configured
app.configure(automergeServer())
```

Then add the configuration in `config/default.json`:

```json
{
  "automerge": {
    "directory": "../data",
    "services": ["todos"]
  }
}
```

The following options are available:

- `directory`: The directory where the automerge repository will be stored.
- `services`: An array of service names to synchronize.
- `document`: The automerge service root document. If not set a new one will be created every time the server starts and print it to the console. Use the printed value as the future `document` option.
- `syncServerUrl`: Set this, if this server should not act as a sync server but instead synchronize with an existing other server.
