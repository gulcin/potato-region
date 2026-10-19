import Peer, { type DataConnection, type PeerError, type PeerOptions } from 'peerjs';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { CODE_PICTURES, COLORS, GROW_MS, MAX_PARTY, PLOT_COUNT, type PotatoColor } from './catalog';
import { parseRoute } from './route';
import { save, state, type Plot } from './state';

export type Emote = 'heart' | 'wave' | 'dance';
export type FarmAction = 'plant' | 'water' | 'harvest';
export type PartyStatus = 'idle' | 'hosting' | 'joining' | 'connected' | 'napping' | 'missing' | 'full';

export interface Presence {
  id: string;
  name: string;
  outfit: string;
  accessory: string;
  pet: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  screen: 'map' | PotatoColor;
  action: FarmAction | null;
  actionUntil: number;
  emote: Emote | null;
  emoteUntil: number;
  self: boolean;
}

interface FarmSnap {
  plots: Record<PotatoColor, Plot[]>;
  sparkle: { color: PotatoColor; index: number; kind: FarmAction } | null;
}

type Intent = { id: string; kind: FarmAction; color: PotatoColor; index: number; player: string };

type Msg =
  | { t: 'hello'; player: Presence }
  | { t: 'welcome'; players: Presence[]; farm: FarmSnap }
  | { t: 'move'; player: Presence }
  | { t: 'intent'; intent: Intent }
  | { t: 'result'; id: string; ok: boolean; award?: PotatoColor }
  | { t: 'farm'; farm: FarmSnap }
  | { t: 'full' }
  | { t: 'bye'; id: string };

interface Hooks {
  onFarm: () => void;
  onPeople: () => void;
  onStatus: () => void;
  onAward: (color: PotatoColor) => void;
}

const hooks: Hooks = {
  onFarm: () => undefined,
  onPeople: () => undefined,
  onStatus: () => undefined,
  onAward: () => undefined,
};

const remotes = new Map<string, Presence>();
const conns = new Map<string, DataConnection>();
let life = 0;
let peer: Peer | null = null;
let hostConn: DataConnection | null = null;
let role: 'host' | 'guest' | null = null;
let status: PartyStatus = 'idle';
let code = '';
let message = '';
let qr = '';
let farm: FarmSnap | null = null;
let leaving = false;
let retryTimer = 0;
let moveTimer = 0;
let sparkleTimer = 0;
let nappingName = '';
const playerId = loadPlayerId();

function loadPlayerId(): string {
  const key = 'aida-potato-player';
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const next = crypto.randomUUID();
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

function freshFarm(): FarmSnap {
  const plots = {} as Record<PotatoColor, Plot[]>;
  for (const color of COLORS) {
    plots[color] = Array.from({ length: PLOT_COUNT }, () => ({ stage: 'empty' as const }));
  }
  return { plots, sparkle: null };
}

function cloneFarm(source: FarmSnap): FarmSnap {
  return JSON.parse(JSON.stringify(source)) as FarmSnap;
}

export function bindParty(next: Hooks): void {
  Object.assign(hooks, next);
}

export function inParty(): boolean {
  return status === 'hosting' || status === 'joining' || status === 'connected' || status === 'napping';
}

export function partyFarm(): Record<PotatoColor, Plot[]> | null {
  return farm?.plots ?? null;
}

export function partySparkle(): FarmSnap['sparkle'] {
  return farm?.sparkle ?? null;
}

export function partySnapshot(): { status: PartyStatus; code: string; message: string; qr: string; role: 'host' | 'guest' | null } {
  return { status, code, message, qr, role };
}

export function peopleHere(): Presence[] {
  const screen = here();
  const list: Presence[] = [];
  if (inParty()) list.push({ ...selfPresence(), self: true });
  for (const person of remotes.values()) {
    if (person.screen === screen) list.push({ ...person, self: false });
  }
  return list;
}

export function friendsElsewhere(): { name: string; farm: PotatoColor }[] {
  const screen = here();
  const found: { name: string; farm: PotatoColor }[] = [];
  for (const person of remotes.values()) {
    if (person.screen !== 'map' && person.screen !== screen) {
      found.push({ name: person.name, farm: person.screen });
    }
  }
  return found;
}

function here(): 'map' | PotatoColor {
  const route = parseRoute();
  if (route.screen === 'farm' && route.farm) return route.farm;
  return 'map';
}

function selfPresence(): Presence {
  return {
    id: playerId,
    name: state.playerName,
    outfit: state.outfit,
    accessory: state.accessory,
    pet: state.pet,
    x: selfX,
    y: selfY,
    tx: selfX,
    ty: selfY,
    screen: here(),
    action: selfAction,
    actionUntil: selfActionUntil,
    emote: selfEmote,
    emoteUntil: selfEmoteUntil,
    self: true,
  };
}

let selfX = 14;
let selfY = 76;
let selfAction: FarmAction | null = null;
let selfActionUntil = 0;
let selfEmote: Emote | null = null;
let selfEmoteUntil = 0;

function peerHost(): string {
  return import.meta.env.VITE_PEER_HOST || '0.peerjs.com';
}

function peerOptions(): PeerOptions {
  const host = peerHost();
  const local = host === '127.0.0.1' || host === 'localhost';
  const secure = import.meta.env.VITE_PEER_SECURE
    ? import.meta.env.VITE_PEER_SECURE === 'true'
    : !local;
  const ice: RTCIceServer[] = [];
  if (!local) {
    ice.push({ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] });
    const turn = import.meta.env.VITE_TURN_URL;
    if (turn) {
      ice.push({
        urls: turn.split(',').map((item) => item.trim()).filter(Boolean),
        username: import.meta.env.VITE_TURN_USERNAME || undefined,
        credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
      });
    }
  }
  return {
    host,
    port: Number(import.meta.env.VITE_PEER_PORT || (secure ? 443 : 9000)),
    path: import.meta.env.VITE_PEER_PATH || '/',
    secure,
    config: { iceServers: ice },
    debug: import.meta.env.VITE_PARTY_TEST === '1' ? 1 : 0,
  };
}

function randomCode(): string {
  let next = '';
  for (let i = 0; i < 4; i += 1) next += Math.floor(Math.random() * 10).toString();
  return next === '0000' ? randomCode() : next;
}

export function pictureFor(digit: string): { word: string; art: string } | undefined {
  const index = Number(digit);
  return CODE_PICTURES[index];
}

function destroyPeer(): void {
  hostConn?.close();
  hostConn = null;
  for (const conn of conns.values()) conn.close();
  conns.clear();
  peer?.destroy();
  peer = null;
}

export function leaveParty(): void {
  life += 1;
  leaving = true;
  window.clearTimeout(retryTimer);
  if (hostConn) send(hostConn, { t: 'bye', id: playerId });
  for (const conn of conns.values()) send(conn, { t: 'bye', id: playerId });
  destroyPeer();
  remotes.clear();
  farm = null;
  role = null;
  status = 'idle';
  code = '';
  qr = '';
  message = '';
  nappingName = '';
  leaving = false;
  hooks.onStatus();
  hooks.onPeople();
  hooks.onFarm();
}

export function startParty(): void {
  leaveParty();
  leaving = false;
  role = 'host';
  status = 'hosting';
  farm = freshFarm();
  message = 'Opening the farm party…';
  hooks.onStatus();
  openHost(randomCode(), 0);
}

function openHost(nextCode: string, attempt: number): void {
  destroyPeer();
  code = nextCode;
  const node = new Peer(`pr${nextCode}`, peerOptions());
  peer = node;
  node.on('open', () => {
    status = 'hosting';
    message = 'Waiting for a friend…';
    void paintQr();
    hooks.onStatus();
    hooks.onFarm();
  });
  node.on('connection', (conn) => welcomeGuest(conn));
  node.on('disconnected', () => {
    if (!leaving && role === 'host') node.reconnect();
  });
  node.on('error', (err: PeerError<string>) => {
    if (err.type === 'unavailable-id' && attempt < 6 && !leaving) {
      openHost(randomCode(), attempt + 1);
      return;
    }
    if (!leaving && role === 'host') {
      message = 'The party line is sleepy. Try again.';
      status = 'missing';
      hooks.onStatus();
    }
  });
}

function welcomeGuest(conn: DataConnection): void {
  const born = life;
  if (conns.size >= MAX_PARTY - 1) {
    conn.on('open', () => {
      send(conn, { t: 'full' });
      conn.close();
    });
    return;
  }
  let guestId = '';
  conn.on('data', (data) => {
    if (born !== life) return;
    const msg = asMsg(data);
    if (!msg) return;
    if (msg.t === 'hello') {
      const guest = msg.player;
      guestId = guest.id;
      remotes.set(guest.id, {
        ...guest,
        self: false,
        tx: guest.x,
        ty: guest.y,
        actionUntil: guest.actionUntil || 0,
      });
      conns.set(guest.id, conn);
      status = 'connected';
      nappingName = '';
      message = `${guest.name} is here.`;
      send(conn, { t: 'welcome', players: [selfPresence(), ...remotes.values()], farm: cloneFarm(farm ?? freshFarm()) });
      relay({ t: 'move', player: guest }, guest.id);
      hooks.onStatus();
      hooks.onPeople();
    } else if (msg.t === 'move') {
      remember(msg.player);
      relay(msg, msg.player.id);
    } else if (msg.t === 'intent') {
      const ok = applyIntent(msg.intent);
      send(conn, { t: 'result', id: msg.intent.id, ok, award: ok && msg.intent.kind === 'harvest' ? msg.intent.color : undefined });
      if (ok) {
        const actor = remotes.get(msg.intent.player);
        if (actor) {
          actor.action = msg.intent.kind;
          actor.actionUntil = Date.now() + 900;
          actor.screen = msg.intent.color;
          relay({ t: 'move', player: actor }, msg.intent.player);
        }
        broadcastFarm();
        hooks.onPeople();
      }
    } else if (msg.t === 'bye') {
      forget(msg.id, true);
    }
  });
  conn.on('close', () => {
    if (born !== life || !guestId) return;
    if (conns.get(guestId) === conn) forget(guestId, !leaving);
  });
}

function forget(id: string, nap: boolean): void {
  const person = remotes.get(id);
  remotes.delete(id);
  conns.delete(id);
  if (nap && person && role === 'host') {
    nappingName = person.name;
    status = 'napping';
    message = `${person.name}'s connection took a nap – reconnecting…`;
  } else if (role === 'host' && remotes.size === 0 && status === 'connected') {
    status = 'hosting';
    message = 'Waiting for a friend…';
  }
  hooks.onStatus();
  hooks.onPeople();
}

export function joinParty(raw: string): void {
  const next = raw.replace(/\D/g, '').slice(0, 4);
  if (next.length !== 4) {
    message = 'The code needs four numbers.';
    hooks.onStatus();
    return;
  }
  leaveParty();
  leaving = false;
  role = 'guest';
  code = next;
  status = 'joining';
  message = 'Looking for the farm party…';
  hooks.onStatus();
  openGuest();
}

function openGuest(): void {
  life += 1;
  const born = life;
  destroyPeer();
  const node = new Peer(peerOptions());
  peer = node;
  node.on('open', () => connectHost());
  node.on('disconnected', () => {
    if (born !== life || leaving || role !== 'guest') return;
    try { node.reconnect(); } catch { scheduleRetry(); }
  });
  node.on('error', () => {
    if (born === life && !leaving && role === 'guest') scheduleRetry();
  });
}

function connectHost(): void {
  if (!peer || leaving || role !== 'guest') return;
  const born = life;
  const conn = peer.connect(`pr${code}`, { reliable: true });
  hostConn = conn;
  const timer = window.setTimeout(() => {
    if (status === 'joining' || status === 'napping') scheduleRetry();
  }, 6000);
  conn.on('open', () => {
    window.clearTimeout(timer);
    send(conn, { t: 'hello', player: selfPresence() });
  });
  conn.on('data', (data) => onGuestData(asMsg(data)));
  conn.on('close', () => {
    window.clearTimeout(timer);
    if (born !== life || leaving || role !== 'guest') return;
    status = 'napping';
    message = nappingName
      ? `${nappingName}'s connection took a nap – reconnecting…`
      : 'The farm party connection took a nap – reconnecting…';
    hooks.onStatus();
    scheduleRetry();
  });
  conn.on('error', () => {
    if (!leaving && role === 'guest') scheduleRetry();
  });
}

function onGuestData(msg: Msg | null): void {
  if (!msg) return;
  if (msg.t === 'full') {
    status = 'full';
    message = 'That farm party is full.';
    leaving = true;
    hooks.onStatus();
    return;
  }
  if (msg.t === 'welcome') {
    status = 'connected';
    farm = cloneFarm(msg.farm);
    remotes.clear();
    for (const person of msg.players) {
      if (person.id === playerId) continue;
      remotes.set(person.id, { ...person, self: false, tx: person.x, ty: person.y });
      if (!nappingName) nappingName = person.name;
    }
    const host = msg.players.find((person) => person.id !== playerId);
    message = host ? `You are with ${host.name}.` : 'You are in the farm party.';
    moveTo(34, 76);
    hooks.onStatus();
    hooks.onPeople();
    hooks.onFarm();
    return;
  }
  if (msg.t === 'farm') {
    farm = cloneFarm(msg.farm);
    hooks.onFarm();
    return;
  }
  if (msg.t === 'move') {
    remember(msg.player);
    return;
  }
  if (msg.t === 'result') {
    if (msg.ok && msg.award) {
      state.potatoes[msg.award] += 1;
      save();
      hooks.onAward(msg.award);
    }
    return;
  }
  if (msg.t === 'bye') forget(msg.id, true);
}

function scheduleRetry(): void {
  if (leaving || role !== 'guest') return;
  window.clearTimeout(retryTimer);
  status = status === 'connected' ? 'napping' : status === 'napping' ? 'napping' : 'joining';
  if (status === 'napping' && !message.includes('nap')) {
    message = 'The farm party connection took a nap – reconnecting…';
    hooks.onStatus();
  }
  retryTimer = window.setTimeout(() => {
    if (leaving || role !== 'guest') return;
    openGuest();
  }, 900);
}

function remember(person: Presence): void {
  if (person.id === playerId) return;
  const prev = remotes.get(person.id);
  const next: Presence = {
    ...person,
    self: false,
    x: prev ? prev.x : person.x,
    y: prev ? prev.y : person.y,
    tx: person.x,
    ty: person.y,
  };
  if (prev && prev.screen !== person.screen) {
    next.x = person.x;
    next.y = person.y;
  }
  remotes.set(person.id, next);
  if (status === 'napping') {
    status = 'connected';
    message = `${person.name} is here.`;
    hooks.onStatus();
  }
  hooks.onPeople();
}

function relay(msg: Msg, except: string): void {
  for (const [id, conn] of conns) {
    if (id !== except) send(conn, msg);
  }
}

function send(conn: DataConnection, msg: Msg): void {
  if (conn.open) conn.send(msg);
}

function asMsg(data: unknown): Msg | null {
  if (!data || typeof data !== 'object' || !('t' in data)) return null;
  return data as Msg;
}

function applyIntent(intent: Intent): boolean {
  if (!farm) return false;
  const plot = farm.plots[intent.color]?.[intent.index];
  if (!plot) return false;
  if (intent.kind === 'plant' && plot.stage === 'empty') plot.stage = 'seed';
  else if (intent.kind === 'water' && plot.stage === 'seed') {
    plot.stage = 'watered';
    plot.wateredAt = Date.now();
  } else if (intent.kind === 'harvest' && plot.stage === 'ready') {
    plot.stage = 'empty';
    delete plot.wateredAt;
  } else return false;
  farm.sparkle = { color: intent.color, index: intent.index, kind: intent.kind };
  window.clearTimeout(sparkleTimer);
  sparkleTimer = window.setTimeout(() => {
    if (farm) farm.sparkle = null;
    hooks.onFarm();
  }, 900);
  return true;
}

function broadcastFarm(): void {
  if (!farm) return;
  const snap = cloneFarm(farm);
  for (const conn of conns.values()) send(conn, { t: 'farm', farm: snap });
  hooks.onFarm();
}

export function performFarmAction(kind: FarmAction, color: PotatoColor, index: number): void {
  if (!inParty()) return;
  flashAction(kind);
  if (role === 'host') {
    const ok = applyIntent({ id: 'self', kind, color, index, player: playerId });
    if (!ok) return;
    if (kind === 'harvest') {
      state.potatoes[color] += 1;
      save();
      hooks.onAward(color);
    }
    broadcastFarm();
    publishSelf();
    return;
  }
  if (hostConn) {
    send(hostConn, { t: 'intent', intent: { id: crypto.randomUUID(), kind, color, index, player: playerId } });
  }
}

function flashAction(kind: FarmAction): void {
  selfAction = kind;
  selfActionUntil = Date.now() + 900;
  hooks.onPeople();
}

export function moveTo(x: number, y: number): void {
  selfX = clamp(x, 8, 92);
  selfY = clamp(y, 16, 86);
  hooks.onPeople();
  if (!inParty()) return;
  if (moveTimer) return;
  moveTimer = window.setTimeout(() => {
    moveTimer = 0;
    publishSelf();
  }, 70);
}

export function notePresence(): void {
  if (!inParty()) return;
  publishSelf();
  hooks.onPeople();
}

export function sendEmote(emote: Emote): void {
  if (!inParty()) return;
  selfEmote = emote;
  selfEmoteUntil = Date.now() + 2600;
  publishSelf();
  hooks.onPeople();
}

function publishSelf(): void {
  const player = selfPresence();
  if (role === 'host') relay({ t: 'move', player }, '');
  else if (hostConn) send(hostConn, { t: 'move', player });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function paintQr(): Promise<void> {
  const url = `${location.origin}${import.meta.env.BASE_URL}#/join/${code}`;
  try {
    qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 220,
      color: { dark: '#2c3550', light: '#fff8ee' },
    });
  } catch {
    qr = '';
  }
  hooks.onStatus();
}

export function readJoinHash(): string | null {
  const match = location.hash.match(/^#\/join\/(\d{4})$/);
  return match?.[1] ?? null;
}

let scanStream: MediaStream | null = null;
let scanOn = false;

export async function startScan(video: HTMLVideoElement, onCode: (code: string) => void): Promise<string | null> {
  stopScan();
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment' },
    });
  } catch {
    return 'The camera is shy. You can type the number.';
  }
  video.srcObject = scanStream;
  video.setAttribute('playsinline', 'true');
  await video.play();
  scanOn = true;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (!scanOn || !ctx) return;
    if (video.readyState >= 2) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(pixels.data, pixels.width, pixels.height);
      const digits = found ? digitsIn(found.data) : null;
      if (digits) {
        stopScan();
        onCode(digits);
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return null;
}

function digitsIn(text: string): string | null {
  const fromUrl = text.match(/join\/(\d{4})/);
  if (fromUrl) return fromUrl[1];
  const only = text.trim();
  return /^\d{4}$/.test(only) ? only : null;
}

export function stopScan(): void {
  scanOn = false;
  scanStream?.getTracks().forEach((track) => track.stop());
  scanStream = null;
}

function growHostFarm(): void {
  if (role !== 'host' || !farm) return;
  let changed = false;
  for (const color of COLORS) {
    farm.plots[color].forEach((plot) => {
      if (plot.stage === 'watered' && plot.wateredAt && Date.now() - plot.wateredAt >= GROW_MS) {
        plot.stage = 'ready';
        delete plot.wateredAt;
        changed = true;
      }
    });
  }
  if (changed) broadcastFarm();
}

function animate(): void {
  const now = Date.now();
  let dirty = false;
  if (selfAction && selfActionUntil < now) {
    selfAction = null;
    dirty = true;
  }
  if (selfEmote && selfEmoteUntil < now) {
    selfEmote = null;
    dirty = true;
  }
  for (const person of remotes.values()) {
    const dx = person.tx - person.x;
    const dy = person.ty - person.y;
    if (Math.hypot(dx, dy) > 0.6) {
      person.x += dx * 0.35;
      person.y += dy * 0.35;
      dirty = true;
    } else if (dx !== 0 || dy !== 0) {
      person.x = person.tx;
      person.y = person.ty;
      dirty = true;
    }
    if (person.emote && person.emoteUntil < now) {
      person.emote = null;
      dirty = true;
    }
    if (person.action && person.actionUntil < now) {
      person.action = null;
      dirty = true;
    }
  }
  if (dirty) hooks.onPeople();
  growHostFarm();
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

export function dropConnectionForTest(): void {
  leaving = false;
  hostConn?.close();
  peer?.destroy();
  peer = null;
  hostConn = null;
  if (role === 'guest') {
    status = 'napping';
    message = 'The farm party connection took a nap – reconnecting…';
    hooks.onStatus();
    scheduleRetry();
  }
}

if (import.meta.env.VITE_PARTY_TEST === '1') {
  const testWindow = window as Window & {
    __party?: { drop: () => void; code: () => string; status: () => PartyStatus };
  };
  testWindow.__party = {
    drop: dropConnectionForTest,
    code: () => code,
    status: () => status,
  };
}
