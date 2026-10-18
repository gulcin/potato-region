import {
  COLORS,
  GROW_MS,
  PLOT_COUNT,
  itemById,
  type Item,
  type PotatoColor,
} from './catalog';

const KEY = 'aida-potato-region-v1';

export interface Plot {
  stage: 'empty' | 'seed' | 'watered' | 'ready';
  wateredAt?: number;
}

export interface Placed {
  id: string;
  x: number;
  y: number;
}

export interface Note {
  id: string;
  type: 'bug' | 'idea';
  note: string;
  screen: string;
  version: string;
  device: string;
  timestamp: string;
}

export interface Save {
  potatoes: Record<PotatoColor, number>;
  counter: PotatoColor[];
  outfit: string;
  accessory: string;
  pet: string;
  petName: string;
  owned: string[];
  placed: Placed[];
  plots: Record<PotatoColor, Plot[]>;
  feedback: Note[];
  feedbackQueue: Note[];
  readAloud: boolean;
  sound: boolean;
  seenWhatsNew: string;
  playerName: string;
}

function emptyPotatoes(): Record<PotatoColor, number> {
  return { blue: 0, green: 0, red: 0, purple: 0, pink: 0, orange: 0, turquoise: 0, lilac: 0 };
}

function freshPlots(): Record<PotatoColor, Plot[]> {
  const plots = {} as Record<PotatoColor, Plot[]>;
  for (const color of COLORS) {
    plots[color] = Array.from({ length: PLOT_COUNT }, () => ({ stage: 'empty' as const }));
  }
  return plots;
}

function fresh(): Save {
  return {
    potatoes: emptyPotatoes(),
    counter: [],
    outfit: 'farm-blue',
    accessory: 'none',
    pet: 'potato',
    petName: 'Pip',
    owned: ['farm-blue', 'potato', 'none'],
    placed: [],
    plots: freshPlots(),
    feedback: [],
    feedbackQueue: [],
    readAloud: false,
    sound: true,
    seenWhatsNew: '',
    playerName: 'Aida',
  };
}

function revive(raw: unknown): Save {
  const base = fresh();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<Save>;
  const potatoes = emptyPotatoes();
  for (const color of COLORS) {
    const value = data.potatoes?.[color];
    potatoes[color] = typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
  }
  const plots = freshPlots();
  for (const color of COLORS) {
    const saved = data.plots?.[color];
    if (!Array.isArray(saved)) continue;
    plots[color] = Array.from({ length: PLOT_COUNT }, (_, index) => {
      const plot = saved[index];
      const stage = plot?.stage;
      if (stage === 'seed' || stage === 'watered' || stage === 'ready' || stage === 'empty') {
        const next: Plot = { stage };
        if (stage === 'watered' && typeof plot?.wateredAt === 'number') {
          next.wateredAt = plot.wateredAt;
          if (Date.now() - plot.wateredAt >= GROW_MS) {
            next.stage = 'ready';
            delete next.wateredAt;
          }
        }
        return next;
      }
      return { stage: 'empty' };
    });
  }
  const owned = Array.isArray(data.owned) ? data.owned.filter((id) => typeof id === 'string') : base.owned;
  for (const id of base.owned) if (!owned.includes(id)) owned.push(id);
  return {
    ...base,
    potatoes,
    plots,
    counter: Array.isArray(data.counter) ? data.counter.filter((color): color is PotatoColor => (COLORS as readonly string[]).includes(color)) : [],
    outfit: typeof data.outfit === 'string' ? data.outfit : base.outfit,
    accessory: typeof data.accessory === 'string' ? data.accessory : base.accessory,
    pet: typeof data.pet === 'string' ? data.pet : base.pet,
    petName: cleanName(typeof data.petName === 'string' ? data.petName : base.petName),
    owned,
    placed: Array.isArray(data.placed)
      ? data.placed.filter((item): item is Placed => !!item && typeof item.id === 'string' && typeof item.x === 'number' && typeof item.y === 'number')
      : [],
    feedback: Array.isArray(data.feedback) ? (data.feedback as Note[]) : [],
    feedbackQueue: Array.isArray(data.feedbackQueue) ? (data.feedbackQueue as Note[]) : [],
    readAloud: Boolean(data.readAloud),
    sound: data.sound !== false,
    seenWhatsNew: typeof data.seenWhatsNew === 'string' ? data.seenWhatsNew : '',
    playerName: cleanName(typeof data.playerName === 'string' ? data.playerName : base.playerName),
  };
}

export function cleanName(raw: string): string {
  const trimmed = raw.replace(/[^\p{L}\p{N} '\-]/gu, '').slice(0, 12).trim();
  return trimmed || 'Pip';
}

export const state: Save = load();

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return revive(JSON.parse(raw));
  } catch {
    return fresh();
  }
}

export function save(): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function totalPotatoes(): number {
  const pocket = COLORS.reduce((sum, color) => sum + state.potatoes[color], 0);
  return pocket + state.counter.length;
}

export function owns(id: string): boolean {
  return state.owned.includes(id);
}

export function placeOnCounter(color: PotatoColor): boolean {
  if (state.potatoes[color] <= 0) return false;
  state.potatoes[color] -= 1;
  state.counter.push(color);
  save();
  return true;
}

export function completeTrade(item: Item): boolean {
  if (owns(item.id) || state.counter.length < item.price) return false;
  state.counter.splice(0, item.price);
  state.owned.push(item.id);
  if (item.kind === 'outfit') state.outfit = item.id;
  if (item.kind === 'accessory') state.accessory = item.id;
  if (item.kind === 'pet') state.pet = item.id;
  save();
  return true;
}

export function wearOutfit(id: string): void {
  const item = itemById(id);
  if (!item || item.kind !== 'outfit' || !owns(id)) return;
  state.outfit = id;
  save();
}

export function wearAccessory(id: string): void {
  const item = itemById(id);
  if (!item || item.kind !== 'accessory' || !owns(id)) return;
  state.accessory = id;
  save();
}

export function choosePet(id: string): void {
  const item = itemById(id);
  if (!item || item.kind !== 'pet' || !owns(id)) return;
  state.pet = id;
  save();
}

export function setPlayerName(raw: string): void {
  state.playerName = cleanName(raw);
  save();
}

export function setPetName(raw: string, allowEmpty = false): void {
  if (allowEmpty && raw.trim() === '') {
    state.petName = '';
    save();
    return;
  }
  state.petName = cleanName(raw);
  save();
}

export const SAVE_KEY = KEY;
