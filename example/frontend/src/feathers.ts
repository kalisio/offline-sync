import { feathers } from "@feathersjs/feathers";
import socketio from "@feathersjs/socketio-client";
import io from "socket.io-client";
import { automergeClient, AutomergeService } from "@kalisio/feathers-automerge";

const FEATHERS_SERVER_URL = "http://localhost:3030";

export type Todo = {
  title: string;
  completed: boolean;
};

export type TodoItem = Todo & {
  _id: string;
};

type TodoService = AutomergeService<Todo>;

export const app = feathers<{ todos: TodoService; automerge: any }>();
const socket = io(FEATHERS_SERVER_URL, { transports: ["websocket"] });

app.configure(socketio(socket));
app.configure(automergeClient(FEATHERS_SERVER_URL));

export async function getApp() {
  if (!app._isSetup) {
    await app.setup();
  }

  return app;
}
