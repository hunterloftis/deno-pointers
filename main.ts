import { serve } from "https://deno.land/std/http/server.ts";
import { bundle } from "https://deno.land/x/emit/mod.ts";

interface User {
  id: string;
  pt: number[];
  dirty?: boolean;
}

const TICK = 50;

const index = await Deno.readFile("index.html");
const pointerCanvas = await bundle("pointer-canvas.ts", {
  cacheRoot: "/dev/null",
});
const users = new Map<WebSocket, User>();

setInterval(broadcastUpdates, TICK);
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

function broadcastUpdates() {
  const dirtyUsers = Array.from(users.values()).filter(user => user.dirty);
  if (dirtyUsers.length === 0) return;

  const data = JSON.stringify(dirtyUsers.map(({ id, pt }) => ({ id, pt })));
  for (const [socket, user] of users.entries()) {
    user.dirty = false;
    socket.send(data);
  }
}

function updateUser(userSocket: WebSocket, data: string) {
  const user = users.get(userSocket);
  if (!user) return;

  user.pt = JSON.parse(data);
  user.dirty = true;
}
