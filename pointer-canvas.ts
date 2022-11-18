interface User {
  pt: number[];
  renderedPt: number[];
  updatedAt: number;
}

const MAX_AGE = 30000;  // un-updated pointers are culled after 30s
const INTERPOLATION = 0.4;
const INTERPOLATE_LIMIT = 0.4;
const BG_COLOR = '#222';
const NODE_RGB = '255, 0, 0';
const USER_RGB = '255, 255, 255';
const DOT_RADIUS = 5;

export class PointerCanvas extends HTMLElement {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  private resizer = new ResizeObserver((_entries) => {
    this.update();
  });
  private socket?: WebSocket;
  private users = new Map<string, User>();

  constructor() {
    super();
    this.style.display = 'block';
    this.style.cursor = 'crosshair';
    this.style.touchAction = 'none';
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.addEventListener('pointermove', this.onPointermove);
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot!.appendChild(this.canvas);
    this.resizer.observe(this);
    this.update();
    this.connectSocket();
    this.draw();
  }

  disconnectedCallback() {
    this.resizer.disconnect();
    this.disconnectSocket();
  }

  private update() {
    this.canvas.width = this.clientWidth;
    this.canvas.height = this.clientHeight;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  private connectSocket() {
    const url = new URL('/', window.location.href);
    url.protocol = url.protocol.replace('http', 'ws');
    this.socket = new WebSocket(url.href);
    this.socket.addEventListener('open', () => console.log('socket opened'));
    this.socket.addEventListener('close', () => {
      console.log('socket closed')
      this.socket = undefined;
    });
    this.socket.addEventListener('error', (e) => {
      console.log('socket error:', (e as ErrorEvent).message);
    });
    this.socket.addEventListener('message', this.onMessage);
  }

  private disconnectSocket() {
    this.socket?.close();
  }

  private draw = () => {
    if (!this.isConnected) return;

    const now = performance.now();
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.users.forEach((user, id) => {
      const age = now - user.updatedAt;
      if (age > MAX_AGE) {
        this.users.delete(id);
        return;
      }
      const alpha = 1 - Math.max(0, Math.min(1, age / MAX_AGE));
      const dx = user.pt[0] - user.renderedPt[0];
      const dy = user.pt[1] - user.renderedPt[1];
      const teleported = Math.abs(dx) > INTERPOLATE_LIMIT || Math.abs(dy) > INTERPOLATE_LIMIT;
      const interp = teleported ? 1 : INTERPOLATION;
      user.renderedPt[0] += dx * interp;
      user.renderedPt[1] += dy * interp;

      const x = user.renderedPt[0] * this.canvas.width;
      const y = user.renderedPt[1] * this.canvas.height;
      const rgb = id.startsWith('node:') ? NODE_RGB : USER_RGB;
      this.ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      this.ctx.fill();
    });
    requestAnimationFrame(this.draw);
  }

  private onPointermove = (e: PointerEvent) => {
    e.preventDefault();
    const x = e.clientX / this.clientWidth;
    const y = e.clientY / this.clientHeight;
    this.socket?.send(JSON.stringify([x, y]));
  }

  private onMessage = ({ data }: MessageEvent) => {
    const now = performance.now();
    const users = JSON.parse(data);
    users.forEach(({ id, pt }: { id: string, pt: number[] }) => {
      const currentUser = this.users.get(id);
      this.users.set(id, {
        pt,
        renderedPt: currentUser?.renderedPt ?? pt,
        updatedAt: now,
      });
    });
  }
}

customElements.define('pointer-canvas', PointerCanvas);