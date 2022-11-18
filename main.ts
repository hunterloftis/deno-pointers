import { serve } from "https://deno.land/std/http/server.ts";
import { bundle } from "https://deno.land/x/emit/mod.ts";

interface User {
  id: string;
  pt: number[];
  dirty?: boolean;
}

const TICK = 50;
const NODE_SPEED = 0.005;

const index = await Deno.readFile("index.html");
const pointerCanvas = await bundle("pointer-canvas.ts", {
  cacheRoot: "/dev/null",
});

const node: User = {
  id: `node:${crypto.randomUUID()}`,
  pt: [Math.random(), Math.random()],
};
const users = new Map<WebSocket, User>();
const remoteUsers = new Map<string, User>();

const angle = Math.random() * Math.PI * 2;
const dx = Math.cos(angle) * NODE_SPEED;
const dy = Math.sin(angle) * NODE_SPEED;
const broadcast = new BroadcastChannel("users");

broadcast.addEventListener("message", onBroadcastMessage);
setInterval(sendUpdates, TICK);
serve(handler);

function handler(req: Request): Response {
  if (req.headers.get("upgrade") === "websocket") {
    return socketHandler(req);
  }
  return httpHandler(req);
}

function httpHandler(req: Request): Response {
  const { pathname } = new URL(req.url);
  if (pathname === "/pointer-canvas.js") {
    return new Response(pointerCanvas.code, {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  }
  return new Response(index, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function socketHandler(req: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);
  const user = { id: crypto.randomUUID(), pt: [0, 0] };

  users.set(socket, user);
  socket.addEventListener("close", () => users.delete(socket));
  socket.addEventListener("open", () => console.log("opened socket:", user.id));
  socket.addEventListener("message", (e) => updateUser(socket, e.data));
  socket.addEventListener("error", (e) => {
    console.log("socket error:", (e as ErrorEvent).message);
  });

  return response;
}

function onBroadcastMessage({ data }: MessageEvent) {
  const updatedRemoteUsers = JSON.parse(data);
  updatedRemoteUsers.forEach(({ id, pt }: { id: string, pt: number[] }) => {
    remoteUsers.set(id, { id, pt, dirty: true });
  });
}

function sendUpdates() {
  const dirtyUsers = Array.from(users.values())
    .filter((user) => user.dirty);
  const dirtyRemoteUsers = Array.from(remoteUsers.values())
    .filter((user) => user.dirty);
  
  const update = [node, ...dirtyUsers, ...dirtyRemoteUsers];
  const data = JSON.stringify(update.map(({ id, pt }) => ({ id, pt })));
  for (const [socket, user] of users.entries()) {
    user.dirty = false;
    socket.send(data);
  }

  // TODO: skip JSON for postMessage stuff
  const peerUpdate = [node, ...dirtyUsers];
  const peerData = JSON.stringify(peerUpdate.map(({ id, pt }) => ({ id, pt })));
  broadcast.postMessage(peerData);
  for (const user of remoteUsers.values()) {
    user.dirty = false;
  }

  node.pt[0] = (1 + node.pt[0] + dx) % 1;
  node.pt[1] = (1 + node.pt[1] + dy) % 1;
}

function updateUser(userSocket: WebSocket, data: string) {
  const user = users.get(userSocket);
  if (!user) return;

  user.pt = JSON.parse(data);
  user.dirty = true;
}
