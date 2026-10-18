import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import './styles.css';
import { chime } from './audio';
import {
  COLORS,
  GROW_MS,
  itemById,
  type PotatoColor,
  type ShopTab,
} from './catalog';
import { flushFeedback, makeNote, mailtoHref, storeNote } from './feedback';
import {
  bindParty,
  inParty,
  joinParty,
  leaveParty,
  moveTo,
  notePresence,
  partyFarm,
  partySparkle,
  partySnapshot,
  peopleHere,
  performFarmAction,
  readJoinHash,
  sendEmote,
  startParty,
  startScan,
  stopScan,
  type Emote,
} from './party';
import { hashFor, parseRoute, screenLabel } from './route';
import {
  choosePet,
  completeTrade,
  owns,
  placeOnCounter,
  save,
  setPetName,
  setPlayerName,
  state,
  totalPotatoes,
  wearAccessory,
  wearOutfit,
  type Plot,
} from './state';
import { numberWords, speak } from './speech';
import { APP_VERSION, applyUpdate, checkForUpdates, initUpdates, isUpdateReady } from './updates';
import {
  headerHtml,
  modalHtml,
  partySlotHtml,
  plotInner,
  plotLabel,
  screenIntro,
  shopSpeech,
  stageHtml,
  type DressTab,
  type View,
} from './ui';

const GATE_ANSWER = '102';
const PAGE_SIZE = 3;

let tellOpen = false;
let noteType: 'bug' | 'idea' = 'idea';
let noteText = '';
let noteStatus = '';
let shopTab: ShopTab = 'clothes';
let selectedItem: string | null = null;
let dressTab: DressTab = 'clothes';
let grownupsUnlocked = false;
let gateEntry = '';
let gateMessage = '';
let feedbackPage = 0;
let selectedFurn: string | null = null;
let updateStatus = '';
let happyUntil = 0;
let suppressClick = false;
let lastSpoken = '';
let partyOpen = false;
let partyPane: View['partyPane'] = 'pick';
let joinCode = '';
let scanNote = '';
let peopleKey = '';
let slotHtml = '';

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  ghost: HTMLImageElement;
  kind: 'pocket' | 'plot' | 'placed';
  color?: PotatoColor;
  plotIndex?: number;
  placedId?: string;
}

let drag: DragState | null = null;

function view(): View {
  return {
    route: parseRoute(),
    tellOpen,
    noteType,
    noteText,
    noteStatus,
    shopTab,
    selectedItem,
    dressTab,
    grownupsUnlocked,
    gateEntry,
    gateMessage,
    feedbackPage,
    selectedFurn,
    updateStatus,
    happy: Date.now() < happyUntil,
    partyOpen,
    partyPane,
    joinCode,
    scanNote,
  };
}

function render(): void {
  const current = view();
  const root = document.querySelector<HTMLElement>('#app');
  const header = document.querySelector<HTMLElement>('#header');
  const stage = document.querySelector<HTMLElement>('#stage');
  const modal = document.querySelector<HTMLElement>('#modal-root');
  if (!root || !header || !stage || !modal) return;
  root.dataset.screen = current.route.screen;
  root.dataset.farm = current.route.farm ?? '';
  root.dataset.potatoColors = COLORS.join(',');
  header.innerHTML = headerHtml(current);
  stage.innerHTML = stageHtml(current);
  modal.innerHTML = modalHtml(current);
  peopleKey = '';
  slotHtml = '';
  paintPartySlot();
  paintPeople();
  attachScan();
  const key = `${current.route.screen}:${current.route.farm ?? ''}`;
  if (key !== lastSpoken) {
    lastSpoken = key;
    speak(screenIntro(current.route));
  }
}

function go(screen: View['route']['screen'], farm?: PotatoColor): void {
  tellOpen = false;
  closePartyModal();
  const next = hashFor(screen, farm);
  if (location.hash === next) {
    render();
    notePresence();
  } else location.hash = next;
}

function closePartyModal(): void {
  if (!partyOpen && !scanNote) return;
  partyOpen = false;
  scanNote = '';
  stopScan();
}

function growthPhase(plot: Plot): string {
  if (plot.stage !== 'watered' || !plot.wateredAt) return '';
  return Date.now() - plot.wateredAt < GROW_MS * 0.45 ? 'sprout' : 'leafy';
}

function paintPlot(el: HTMLElement, plot: Plot, color: PotatoColor): void {
  const phase = growthPhase(plot);
  if (el.dataset.stage === plot.stage && (el.dataset.grow ?? '') === phase) return;
  el.dataset.stage = plot.stage;
  el.dataset.grow = phase;
  el.setAttribute('aria-label', plotLabel(plot, color));
  el.innerHTML = plotInner(color, plot, phase);
}

function paintCount(): void {
  const total = totalPotatoes();
  const number = document.querySelector('[data-potato-total]');
  const pill = document.querySelector('[data-potato-label]');
  if (number) number.textContent = String(total);
  pill?.setAttribute('aria-label', `${total} potatoes`);
}

function paintShopBits(): void {
  const count = document.querySelector('[data-counter-count]');
  if (count) {
    count.textContent = String(state.counter.length);
    count.classList.remove('bump');
    void (count as HTMLElement).offsetWidth;
    count.classList.add('bump');
  }
  const speech = document.querySelector('[data-shop-speech]');
  if (speech) speech.textContent = shopSpeech(selectedItem);
  const trade = document.querySelector<HTMLButtonElement>('[data-action="trade"]');
  const item = selectedItem ? itemById(selectedItem) : undefined;
  if (trade) trade.disabled = !item || owns(item.id) || state.counter.length < item.price;
  const pocket = document.querySelector('[data-pocket]');
  if (pocket) {
    const buttons = COLORS.filter((color) => state.potatoes[color] > 0).map((color) => `
      <button type="button" data-pocket-potato data-color="${color}" aria-label="${color} potato">
        <img src="${import.meta.env.BASE_URL}art/potato-${color}.webp" alt="" draggable="false">
        <span class="badge">${state.potatoes[color]}</span>
      </button>`).join('');
    pocket.innerHTML = buttons || '<p class="hint">Farm some potatoes first.</p>';
  }
}

function celebrate(): void {
  happyUntil = Date.now() + 1400;
  document.querySelector('[data-active-pet]')?.classList.add('is-happy');
  const image = document.querySelector<HTMLImageElement>('[data-pet-img]');
  if (image && state.pet === 'potato') {
    image.src = `${import.meta.env.BASE_URL}art/pet-potato-happy.webp`;
  }
  window.setTimeout(() => {
    document.querySelector('[data-active-pet]')?.classList.remove('is-happy');
    if (image && state.pet === 'potato' && Date.now() >= happyUntil) {
      image.src = `${import.meta.env.BASE_URL}art/pet-potato.webp`;
    }
  }, 1400);
}

function refreshBanner(): void {
  const slot = document.querySelector('[data-update-slot]');
  if (!slot) return;
  const show = isUpdateReady() && parseRoute().screen === 'map';
  slot.innerHTML = show
    ? '<div class="update-banner"><button type="button" data-action="reload-update">Update ready</button></div>'
    : '';
}

const PLOT_SPOTS = [
  { x: 32, y: 42 },
  { x: 68, y: 42 },
  { x: 32, y: 72 },
  { x: 68, y: 72 },
];

function standByPlot(index: number): void {
  const spot = PLOT_SPOTS[index] ?? PLOT_SPOTS[0];
  moveTo(spot.x, spot.y);
}

function harvest(color: PotatoColor, index: number): void {
  if (inParty()) {
    const plot = partyFarm()?.[color]?.[index];
    if (!plot || plot.stage !== 'ready') return;
    performFarmAction('harvest', color, index);
    standByPlot(index);
    return;
  }
  const plot = state.plots[color][index];
  if (!plot || plot.stage !== 'ready') return;
  plot.stage = 'empty';
  delete plot.wateredAt;
  state.potatoes[color] += 1;
  save();
  chime('pick');
  celebrate();
  speak(`A ${color} potato for ${state.petName}.`);
  const el = document.querySelector<HTMLElement>(`[data-plot="${index}"]`);
  if (el && parseRoute().farm === color) paintPlot(el, plot, color);
  paintCount();
}

function paintPartySlot(): void {
  const slot = document.querySelector('[data-party-slot]');
  if (!slot) return;
  const html = partySlotHtml();
  if (html === slotHtml) return;
  slotHtml = html;
  slot.innerHTML = html;
}

function repaintPartyFarm(): void {
  const route = parseRoute();
  if (route.screen !== 'farm' || !route.farm) return;
  const plots = partyFarm()?.[route.farm];
  if (!plots) return;
  const spark = partySparkle();
  plots.forEach((plot, index) => {
    const el = document.querySelector<HTMLElement>(`[data-plot="${index}"]`);
    if (!el) return;
    paintPlot(el, plot, route.farm as PotatoColor);
    if (spark && spark.color === route.farm && spark.index === index) el.dataset.sparkle = spark.kind;
    else delete el.dataset.sparkle;
  });
}

function walkerHtml(person: ReturnType<typeof peopleHere>[number]): string {
  const outfit = itemById(person.outfit);
  const accessory = itemById(person.accessory);
  const pet = itemById(person.pet);
  const extra = accessory && accessory.id !== 'none' && accessory.art
    ? `<img class="doll-acc acc-${accessory.id}" alt="" src="${import.meta.env.BASE_URL}${accessory.art}" draggable="false">`
    : '';
  const pops: Record<string, string> = {
    heart: 'art/heart.webp',
    wave: 'art/emote-wave.webp',
    dance: 'art/pet-potato-happy.webp',
    plant: 'art/sprout.webp',
    water: 'art/water.webp',
    harvest: 'art/heart.webp',
  };
  const pop = person.emote ? pops[person.emote] : person.action ? pops[person.action] : '';
  const petSrc = pet ? `${import.meta.env.BASE_URL}${pet.art}` : '';
  return `<div class="walker" data-person="${person.id}" data-self="${person.self ? 'true' : 'false'}" data-remote="${person.self ? 'false' : 'true'}" data-x="${person.x.toFixed(1)}" data-y="${person.y.toFixed(1)}" data-emote="${person.emote ?? ''}" data-action="${person.action ?? ''}" style="left:${person.x}%;top:${person.y}%">
    <div class="doll">
      <img class="doll-body" alt="" src="${import.meta.env.BASE_URL}${outfit?.art ?? 'art/outfit-farm-blue.webp'}" draggable="false">
      ${extra}
    </div>
    ${petSrc ? `<img class="walker-pet" alt="" src="${petSrc}" draggable="false">` : ''}
    <span class="walker-name">${person.name.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</span>
    ${pop ? `<img class="walker-pop" alt="" src="${import.meta.env.BASE_URL}${pop}" draggable="false">` : ''}
  </div>`;
}

function paintPeople(): void {
  const layer = document.querySelector('[data-people]');
  if (!layer) return;
  const people = peopleHere();
  const key = people.map((person) => `${person.id}|${person.outfit}|${person.accessory}|${person.pet}|${person.emote ?? ''}|${person.action ?? ''}|${person.name}`).join(';');
  if (key !== peopleKey) {
    peopleKey = key;
    layer.innerHTML = people.map((person) => walkerHtml(person)).join('');
  }
  for (const person of people) {
    const el = layer.querySelector<HTMLElement>(`[data-person="${person.id}"]`);
    if (!el) continue;
    el.style.left = `${person.x}%`;
    el.style.top = `${person.y}%`;
    el.dataset.x = person.x.toFixed(1);
    el.dataset.y = person.y.toFixed(1);
  }
}

function attachScan(): void {
  if (!partyOpen || partyPane !== 'scan') return;
  const video = document.querySelector('video[data-scan-video]');
  if (!(video instanceof HTMLVideoElement) || video.srcObject) return;
  void startScan(video, (found) => {
    joinCode = found;
    partyPane = 'join';
    scanNote = '';
    render();
    joinParty(found);
  }).then((note) => {
    if (!note) return;
    scanNote = note;
    const el = document.querySelector('[data-scan-note]');
    if (el) el.textContent = note;
  });
}

function readPlayerName(): void {
  const field = document.querySelector<HTMLInputElement>('[data-player-name]');
  if (field) setPlayerName(field.value);
}

function over(selector: string, x: number, y: number, pad = 12): boolean {
  const el = document.querySelector(selector);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
}

function onClick(event: Event): void {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  const farm = target.closest<HTMLElement>('[data-goto-farm]')?.dataset.gotoFarm as PotatoColor | undefined;
  const goto = target.closest<HTMLElement>('[data-goto]')?.dataset.goto;
  const plotEl = target.closest<HTMLElement>('[data-plot]');
  const item = target.closest<HTMLElement>('[data-item]');
  const tab = target.closest<HTMLElement>('[data-tab]');
  const dress = target.closest<HTMLElement>('[data-dress-tab]');
  const wear = target.closest<HTMLElement>('[data-wear]');
  const acc = target.closest<HTMLElement>('[data-wear-acc]');
  const pet = target.closest<HTMLElement>('[data-choose-pet]');
  const furn = target.closest<HTMLElement>('[data-furn]');
  const key = target.closest<HTMLElement>('[data-key]');
  const feedbackType = target.closest<HTMLElement>('[data-feedback-type]');

  if (farm && (COLORS as readonly string[]).includes(farm)) {
    go('farm', farm);
    return;
  }
  if (goto === 'shop' || goto === 'dress' || goto === 'house') {
    go(goto);
    return;
  }
  const emote = target.closest<HTMLElement>('[data-emote]')?.dataset.emote;
  if (emote === 'heart' || emote === 'wave' || emote === 'dance') {
    sendEmote(emote as Emote);
    return;
  }
  const friendFarm = target.closest<HTMLElement>('[data-goto-friend]')?.dataset.gotoFriend as PotatoColor | undefined;
  if (friendFarm && (COLORS as readonly string[]).includes(friendFarm)) {
    go('farm', friendFarm);
    return;
  }
  const preset = target.closest<HTMLElement>('[data-name-preset]')?.dataset.namePreset;
  if (preset) {
    setPlayerName(preset);
    notePresence();
    render();
    return;
  }
  if (action === 'party') {
    tellOpen = false;
    partyOpen = true;
    partyPane = 'pick';
    scanNote = '';
    render();
    return;
  }
  if (action === 'party-start') {
    readPlayerName();
    notePresence();
    startParty();
    partyPane = 'host';
    render();
    return;
  }
  if (action === 'party-join-pane') {
    readPlayerName();
    partyPane = 'join';
    render();
    return;
  }
  if (action === 'party-join') {
    readPlayerName();
    const field = document.querySelector<HTMLInputElement>('[data-join-code]');
    if (field) joinCode = field.value.replace(/\D/g, '').slice(0, 4);
    notePresence();
    joinParty(joinCode);
    return;
  }
  if (action === 'party-scan') {
    partyPane = 'scan';
    scanNote = '';
    render();
    return;
  }
  if (action === 'party-close') {
    closePartyModal();
    render();
    return;
  }
  if (action === 'party-leave') {
    leaveParty();
    closePartyModal();
    render();
    return;
  }
  if (action === 'map') return go('map');
  if (action === 'whatsnew') {
    state.seenWhatsNew = APP_VERSION;
    save();
    go('whatsnew');
    return;
  }
  if (action === 'grownups') return go('grownups');
  if (action === 'tell') {
    tellOpen = true;
    noteStatus = '';
    render();
    return;
  }
  if (action === 'close-modal') {
    tellOpen = false;
    render();
    return;
  }
  if (action === 'read') {
    state.readAloud = !state.readAloud;
    save();
    if (state.readAloud) speak(screenIntro(parseRoute()), true);
    else window.speechSynthesis?.cancel();
    render();
    return;
  }
  if (action === 'sound') {
    state.sound = !state.sound;
    save();
    render();
    return;
  }
  if (action === 'reload-update') {
    applyUpdate();
    return;
  }
  if (action === 'check-updates') {
    void checkForUpdates(refreshBanner).then((result) => {
      updateStatus = result === 'ready'
        ? 'An update is ready. Go to the map and tap Update ready.'
        : result === 'newest'
          ? 'You have the newest game.'
          : 'Try again in a moment.';
      const status = document.querySelector('[data-update-status]');
      if (status) status.textContent = updateStatus;
      refreshBanner();
    });
    return;
  }
  if (action === 'feedback-save') {
    void saveFeedback();
    return;
  }
  if (action === 'trade') {
    const chosen = selectedItem ? itemById(selectedItem) : undefined;
    if (!chosen) return;
    if (owns(chosen.id)) {
      speak('This one is already yours.');
      return;
    }
    if (completeTrade(chosen)) {
      chime('trade');
      celebrate();
      speak(`${chosen.name} is yours.`);
      render();
    } else {
      speak('You need more potatoes.');
      paintShopBits();
    }
    return;
  }
  if (action === 'place' && selectedFurn) {
    placeFurniture(selectedFurn);
    return;
  }
  if (action === 'put-away' && selectedFurn) {
    state.placed = state.placed.filter((piece) => piece.id !== selectedFurn);
    save();
    render();
    return;
  }
  if (action === 'feedback-prev') {
    feedbackPage = Math.max(0, feedbackPage - 1);
    render();
    return;
  }
  if (action === 'feedback-next') {
    const pages = Math.max(1, Math.ceil(state.feedback.length / PAGE_SIZE));
    feedbackPage = Math.min(pages - 1, feedbackPage + 1);
    render();
    return;
  }
  if (action === 'pet') {
    celebrate();
    speak(`${state.petName} is happy.`);
    return;
  }
  if (plotEl && parseRoute().screen === 'farm' && parseRoute().farm) {
    const color = parseRoute().farm as PotatoColor;
    const index = Number(plotEl.dataset.plot);
    if (inParty()) {
      const plot = partyFarm()?.[color]?.[index];
      if (!plot) return;
      if (plot.stage === 'empty') {
        performFarmAction('plant', color, index);
        standByPlot(index);
        chime('plant');
      } else if (plot.stage === 'seed') {
        performFarmAction('water', color, index);
        standByPlot(index);
        chime('water');
      } else if (plot.stage === 'ready') harvest(color, index);
      return;
    }
    const plot = state.plots[color][index];
    if (!plot) return;
    if (plot.stage === 'empty') {
      plot.stage = 'seed';
      save();
      chime('plant');
      paintPlot(plotEl, plot, color);
      return;
    }
    if (plot.stage === 'seed') {
      plot.stage = 'watered';
      plot.wateredAt = Date.now();
      save();
      chime('water');
      paintPlot(plotEl, plot, color);
      return;
    }
    if (plot.stage === 'ready') harvest(color, index);
    return;
  }
  if (item) {
    selectedItem = item.dataset.item ?? null;
    render();
    const chosen = selectedItem ? itemById(selectedItem) : undefined;
    if (chosen) speak(`${chosen.name}. ${numberWords(chosen.price)} potatoes.`);
    return;
  }
  if (tab?.dataset.tab === 'clothes' || tab?.dataset.tab === 'hats' || tab?.dataset.tab === 'pets' || tab?.dataset.tab === 'house') {
    shopTab = tab.dataset.tab;
    render();
    return;
  }
  if (dress?.dataset.dressTab === 'clothes' || dress?.dataset.dressTab === 'hats' || dress?.dataset.dressTab === 'pets') {
    dressTab = dress.dataset.dressTab;
    render();
    return;
  }
  if (wear?.dataset.wear) {
    wearOutfit(wear.dataset.wear);
    notePresence();
    render();
    return;
  }
  if (acc?.dataset.wearAcc) {
    wearAccessory(acc.dataset.wearAcc);
    notePresence();
    render();
    return;
  }
  if (pet?.dataset.choosePet) {
    choosePet(pet.dataset.choosePet);
    notePresence();
    celebrate();
    render();
    return;
  }
  if (furn?.dataset.furn) {
    selectedFurn = furn.dataset.furn;
    render();
    return;
  }
  if (feedbackType?.dataset.feedbackType === 'bug' || feedbackType?.dataset.feedbackType === 'idea') {
    noteType = feedbackType.dataset.feedbackType;
    refreshMailto();
    document.querySelectorAll<HTMLElement>('[data-feedback-type]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.feedbackType === noteType ? 'true' : 'false');
    });
    return;
  }
  if (key?.dataset.key) pressKey(key.dataset.key);
}


async function saveFeedback(): Promise<void> {
  const field = document.querySelector<HTMLTextAreaElement>('[data-feedback-note]');
  noteText = field?.value ?? noteText;
  if (!noteText.trim()) {
    noteStatus = 'Write a note first.';
    const status = document.querySelector('[data-feedback-status]');
    if (status) status.textContent = noteStatus;
    return;
  }
  const note = makeNote(noteType, noteText, screenLabel(parseRoute()));
  const result = await storeNote(note);
  noteStatus = result === 'sent'
    ? 'Saved and sent.'
    : result === 'queued'
      ? 'Saved on this iPad. I will send it later.'
      : 'Saved on this iPad.';
  const status = document.querySelector('[data-feedback-status]');
  if (status) status.textContent = noteStatus;
  speak(noteStatus);
}

function refreshMailto(): void {
  const field = document.querySelector<HTMLTextAreaElement>('[data-feedback-note]');
  if (field) noteText = field.value;
  const link = document.querySelector<HTMLAnchorElement>('[data-action="mailto"]');
  if (!link) return;
  const note = makeNote(noteType, noteText, screenLabel(parseRoute()));
  link.href = mailtoHref(note);
}

function pressKey(key: string): void {
  if (key === 'clear') gateEntry = '';
  else if (key === 'ok') {
    if (gateEntry === GATE_ANSWER) {
      grownupsUnlocked = true;
      gateMessage = '';
      gateEntry = '';
    } else {
      gateMessage = 'Try again with a grown-up.';
      gateEntry = '';
    }
  } else if (gateEntry.length < 4) gateEntry += key;
  render();
}

function placeFurniture(id: string): void {
  if (!owns(id) || state.placed.some((piece) => piece.id === id)) return;
  const n = state.placed.length;
  state.placed.push({ id, x: 20 + (n % 3) * 30, y: 56 + Math.floor(n / 3) * 22 });
  save();
  render();
}

function onInput(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (target instanceof HTMLInputElement && target.matches('[data-join-code]')) {
    joinCode = target.value.replace(/\D/g, '').slice(0, 4);
    if (target.value !== joinCode) target.value = joinCode;
    const row = document.querySelector('[data-code-pictures]');
    if (row) {
      const pics = joinCode.padEnd(4, ' ').slice(0, 4).split('').map((digit) => {
        const art = ['art/potato-blue.webp', 'art/potato-green.webp', 'art/potato-red.webp', 'art/potato-purple.webp', 'art/potato-pink.webp', 'art/potato-orange.webp', 'art/potato-turquoise.webp', 'art/potato-lilac.webp', 'art/heart.webp', 'art/sprout.webp'][Number(digit)];
        const word = ['blue', 'green', 'red', 'purple', 'pink', 'orange', 'splash', 'lilac', 'heart', 'sprout'][Number(digit)];
        if (!art || Number.isNaN(Number(digit))) return '<span class="code-pic empty"></span>';
        return `<span class="code-pic"><img alt="${word}" src="${import.meta.env.BASE_URL}${art}" draggable="false"><span>${word}</span></span>`;
      }).join('');
      row.innerHTML = pics;
    }
  }
  if (target instanceof HTMLInputElement && target.matches('[data-pet-name]')) {
    const label = document.querySelector('[data-pet-label]');
    if (label) label.textContent = target.value.trim() || 'Pip';
    if (target.value.trim()) {
      state.petName = target.value.slice(0, 12);
      save();
    }
  }
  if (target instanceof HTMLTextAreaElement && target.matches('[data-feedback-note]')) refreshMailto();
}

function onBlur(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches('[data-player-name]')) {
    setPlayerName(target.value);
    target.value = state.playerName;
    notePresence();
    return;
  }
  if (!target.matches('[data-pet-name]')) return;
  setPetName(target.value);
  target.value = state.petName;
  const label = document.querySelector('[data-pet-label]');
  if (label) label.textContent = state.petName;
}

function makeGhost(src: string, x: number, y: number): HTMLImageElement {
  const ghost = document.createElement('img');
  ghost.src = src;
  ghost.alt = '';
  ghost.className = 'drag-ghost';
  ghost.style.left = `${x - 28}px`;
  ghost.style.top = `${y - 28}px`;
  document.body.appendChild(ghost);
  return ghost;
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (!target || target.closest('input, textarea, a')) return;
  const pocket = target.closest<HTMLElement>('[data-pocket-potato]');
  const placed = target.closest<HTMLElement>('[data-placed]');
  const plot = target.closest<HTMLElement>('[data-plot]');
  const ready = plot?.dataset.stage === 'ready';
  if (!pocket && !placed && !ready) {
    if (!inParty()) return;
    const walk = target.closest<HTMLElement>('[data-walk]');
    if (!walk || target.closest('button, a, input, textarea, label')) return;
    const rect = walk.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    moveTo(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
    return;
  }
  event.preventDefault();
  suppressClick = true;
  const point = { x: event.clientX, y: event.clientY };
  if (pocket) {
    const color = pocket.dataset.color as PotatoColor;
    drag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
      ghost: makeGhost(`${import.meta.env.BASE_URL}art/potato-${color}.webp`, point.x, point.y),
      kind: 'pocket',
      color,
    };
  } else if (placed) {
    drag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
      ghost: makeGhost('', point.x, point.y),
      kind: 'placed',
      placedId: placed.dataset.placed,
    };
    drag.ghost.remove();
  } else if (plot && ready) {
    const color = (parseRoute().farm ?? 'blue') as PotatoColor;
    drag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
      ghost: makeGhost(`${import.meta.env.BASE_URL}art/potato-${color}.webp`, point.x, point.y),
      kind: 'plot',
      color,
      plotIndex: Number(plot.dataset.plot),
    };
  }
  try {
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  } catch {
    /* Pointer capture is a bonus. */
  }
}

function movePlaced(id: string, x: number, y: number, persist: boolean): void {
  const piece = state.placed.find((entry) => entry.id === id);
  if (!piece) return;
  piece.x = x;
  piece.y = y;
  const el = document.querySelector<HTMLElement>(`[data-placed="${id}"]`);
  if (el) {
    el.dataset.x = String(Math.round(x));
    el.dataset.y = String(Math.round(y));
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
  }
  if (persist) save();
}

function onPointerMove(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (Math.hypot(dx, dy) > 8) drag.moved = true;
  drag.ghost.style.left = `${event.clientX - 28}px`;
  drag.ghost.style.top = `${event.clientY - 28}px`;
  if (drag.kind === 'placed' && drag.placedId) {
    const room = document.querySelector('[data-room]');
    if (!room) return;
    const rect = room.getBoundingClientRect();
    const x = Math.min(88, Math.max(12, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(84, Math.max(46, ((event.clientY - rect.top) / rect.height) * 100));
    movePlaced(drag.placedId, x, y, false);
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = drag;
  drag = null;
  current.ghost.remove();
  window.setTimeout(() => {
    suppressClick = false;
  }, 0);
  if (current.kind === 'pocket' && current.color && over('[data-counter]', event.clientX, event.clientY)) {
    if (placeOnCounter(current.color)) {
      paintShopBits();
      paintCount();
      speak(numberWords(state.counter.length));
    }
    return;
  }
  if (current.kind === 'plot' && current.color !== undefined && current.plotIndex !== undefined) {
    const dropped = current.moved && over('[data-basket]', event.clientX, event.clientY);
    if (!current.moved || dropped) harvest(current.color, current.plotIndex);
    return;
  }
  if (current.kind === 'placed' && current.placedId) {
    if (current.moved) {
      const piece = state.placed.find((entry) => entry.id === current.placedId);
      if (piece) movePlaced(current.placedId, piece.x, piece.y, true);
    } else {
      selectedFurn = current.placedId;
      render();
    }
  }
}

function tick(): void {
  let grew = false;
  for (const color of COLORS) {
    state.plots[color].forEach((plot, index) => {
      if (plot.stage === 'watered' && plot.wateredAt && Date.now() - plot.wateredAt >= GROW_MS) {
        plot.stage = 'ready';
        delete plot.wateredAt;
        grew = true;
      }
      if (!inParty() && parseRoute().screen === 'farm' && parseRoute().farm === color) {
        const el = document.querySelector<HTMLElement>(`[data-plot="${index}"]`);
        if (el) paintPlot(el, plot, color);
      }
    });
  }
  if (grew) {
    save();
    celebrate();
  }
  if (inParty()) repaintPartyFarm();
}

function boot(): void {
  const pendingJoin = readJoinHash();
  if (pendingJoin) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    partyOpen = true;
    partyPane = 'join';
    joinCode = pendingJoin;
  } else if (!location.hash) location.replace('#/');
  bindParty({
    onFarm: () => repaintPartyFarm(),
    onPeople: () => {
      paintPeople();
      paintPartySlot();
    },
    onStatus: () => {
      const snap = partySnapshot();
      const wasOpen = partyOpen;
      if (partyOpen && partyPane === 'join' && snap.status === 'connected') closePartyModal();
      if (partyOpen || wasOpen) render();
      else {
        paintPartySlot();
        paintPeople();
      }
    },
    onAward: (color) => {
      chime('pick');
      celebrate();
      paintCount();
      speak(`A ${color} potato for ${state.playerName}.`);
    },
  });
  window.addEventListener('hashchange', () => {
    tellOpen = false;
    render();
    notePresence();
  });
  document.body.addEventListener('click', onClick);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('focusout', onBlur);
  document.body.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
  document.body.addEventListener('pointermove', onPointerMove);
  document.body.addEventListener('pointerup', onPointerUp);
  document.body.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('online', () => {
    void flushFeedback();
  });
  window.setInterval(tick, 200);
  render();
  if (pendingJoin) joinParty(pendingJoin);
  void initUpdates(refreshBanner);
  void flushFeedback();
}

boot();
