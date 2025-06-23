# Feathers Offline Synchronization

## Example

This repository contains an example for a Feathers API with full offline-first capabilities. It comes in several components:

### Installation

Install all the dependencies in the monorepo with

```
yarn install
```

### Starting the application

When using Visual Studio Code, all the below commands will be started automatically.

### Development script

All commands can also be run at once with

```
yarn run dev
```

#### MongoDB

Start the local MongoDB server with

```
docker compose up
```

#### server

This is a standard Feathers 5 API with websockets enabled and a `todos` service as well as a `sync` service which stores information about the synced documents (e.g. Automerge document IDs, service path and channel).

Run it with

```
cd server
yarn run dev
```

You can also run a second server instance to test server to server synchronization by running the command with the following environment variables:

```sh
PORT=3031 MONGODB="mongodb://127.0.0.1:27018/server" AUTOMERGE_DIRECTORY="../data2" SYNC_SERVER_URL="http://localhost:3030" yarn run dev
```

#### frontend

The frontend is a simple Todo app using VueJS and a Feathers client with websockets enabled and a `todos` service.

Run it with:

```sh
cd frontend
yarn run dev
```

Then go to [localhost:5173](http://localhost:5173).

## Goal

The goal of this project is to add full offline-first capabilities to a Feathers API.

## Automerge Snapshots

In order to flexibly add offline capabilities we are proposing the following structure:

```mermaid
graph TD
  FA[Feathers API/Database] -->|Events/Logs| SN[Snapshot Server]
  SN <-->|Syncs| C1
  C1[Client] -->|Creates Snapshot| SN
  SN --> |Updates| FA
```

## Alternatives

Several local-first synchronization options were evaluated, however, most rely on (Postgre)SQL or paid infrastructure.

<img width="1821" alt="local-first-projects" src="https://github.com/user-attachments/assets/85c9fa2a-f0b9-4506-af71-1f02d510d1e7" />

## Limitations

- Soft delete
- Run hooks (keep separate snapshot of server "view" and client changes)
