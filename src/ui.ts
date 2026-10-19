import {
  ACCESSORIES,
  COLOR_LABEL,
  COLORS,
  FURNITURE,
  NAME_PRESETS,
  OUTFITS,
  PETS,
  SHOP_ITEMS,
  WHATS_NEW,
  itemById,
  potatoArt,
  type Item,
  type PotatoColor,
  type ShopTab,
} from './catalog';
import { mailtoHref } from './feedback';
import { friendsElsewhere, partyFarm, partySnapshot, pictureFor } from './party';
import { screenLabel, type Route } from './route';
import { owns, state, totalPotatoes, type Note, type Plot } from './state';
import { numberWords } from './speech';
import { APP_VERSION, isUpdateReady } from './updates';

export type DressTab = 'clothes' | 'hats' | 'pets';

export interface View {
  route: Route;
  tellOpen: boolean;
  noteType: 'bug' | 'idea';
  noteText: string;
  noteStatus: string;
  shopTab: ShopTab;
  selectedItem: string | null;
  dressTab: DressTab;
  grownupsUnlocked: boolean;
  gateEntry: string;
  gateMessage: string;
  feedbackPage: number;
  selectedFurn: string | null;
  updateStatus: string;
  happy: boolean;
  partyOpen: boolean;
  partyPane: 'pick' | 'host' | 'join' | 'scan';
  joinCode: string;
  scanNote: string;
}

function art(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function shopSpeech(selectedId: string | null): string {
  const item = selectedId ? itemById(selectedId) : undefined;
  if (!item) return 'Tap something you like.';
  if (owns(item.id)) return 'This one is already yours.';
  const count = state.counter.length;
  if (count <= 0) return `Drag ${numberWords(item.price)} potatoes to the counter.`;
  if (count < item.price) {
    return `That is ${numberWords(count)}. You need ${numberWords(item.price - count)} more.`;
  }
  return `That is ${numberWords(count)}. Tap Trade.`;
}

export function plotLabel(plot: Plot, color: PotatoColor): string {
  if (plot.stage === 'empty') return `Plant a ${color} potato`;
  if (plot.stage === 'seed') return `Water the ${color} potato`;
  if (plot.stage === 'watered') return `${COLOR_LABEL[color]} potato is growing`;
  return `Pick the ${color} potato`;
}

export function plotWord(plot: Plot): string {
  if (plot.stage === 'empty') return 'Plant';
  if (plot.stage === 'seed') return 'Water';
  if (plot.stage === 'watered') return 'Growing';
  return 'Pick';
}

export function plotInner(color: PotatoColor, plot: Plot, phase: string): string {
  const potato = art(potatoArt(color));
  const bed = `<img class="bed" alt="" src="${art('art/soil.webp')}" draggable="false">`;
  const sprout = `<img class="crop sprout" alt="" src="${art('art/sprout.webp')}" draggable="false">`;
  const leafy = `<img class="crop leafy" alt="" src="${art('art/leafy.webp')}" draggable="false">`;
  const bits = [bed];
  if (plot.stage === 'seed' || (plot.stage === 'watered' && phase === 'sprout')) bits.push(sprout);
  if ((plot.stage === 'watered' && phase !== 'sprout') || plot.stage === 'ready') bits.push(leafy);
  if (plot.stage === 'watered') bits.push(`<img class="splash" alt="" src="${art('art/water.webp')}" draggable="false">`);
  if (plot.stage === 'ready') {
    bits.push(`<img class="crop ready-potato" data-harvest-potato data-color="${color}" alt="" src="${potato}" draggable="false">`);
    bits.push('<span class="sparkle" aria-hidden="true"></span>');
  }
  bits.push(`<span class="plot-word">${plotWord(plot)}</span>`);
  return bits.join('');
}

function dollHtml(): string {
  const outfit = itemById(state.outfit) ?? OUTFITS[0];
  const accessory = itemById(state.accessory);
  const extra = accessory && accessory.id !== 'none' && accessory.art
    ? `<img class="doll-acc acc-${accessory.id}" data-player-acc alt="" src="${art(accessory.art)}" draggable="false">`
    : '';
  return `<div class="doll" data-player data-outfit="${outfit.id}" data-accessory="${state.accessory}">
    <img class="doll-body" data-player-body alt="${esc(outfit.name)}" src="${art(outfit.art)}" draggable="false">
    ${extra}
  </div>`;
}

function petHtml(happy: boolean): string {
  const pet = itemById(state.pet) ?? PETS[0];
  const src = pet.id === 'potato' && happy ? art('art/pet-potato-happy.webp') : art(pet.art);
  const label = state.pet === 'potato' ? state.petName : pet.name;
  return `<button type="button" class="pet-btn${happy ? ' is-happy' : ''}" data-action="pet" data-active-pet data-pet="${pet.id}" aria-label="${esc(label)}">
    <img class="pet-body" data-pet-img alt="" src="${src}" draggable="false">
    <img class="pet-heart" alt="" src="${art('art/heart.webp')}" draggable="false">
  </button>`;
}

function titleFor(route: Route): string {
  if (route.screen === 'map') return 'Potato Region';
  return screenLabel(route);
}

export function headerHtml(view: View): string {
  const onMap = view.route.screen === 'map';
  const total = totalPotatoes();
  const readLabel = state.readAloud ? 'Quiet' : 'Read';
  return `<div class="title-row">
      <h1>${esc(titleFor(view.route))}</h1>
      <div class="count-pill" data-potato-label aria-label="${total} potatoes">
        <img src="${art('art/potato-count.webp')}" alt="" draggable="false">
        <span data-potato-total>${total}</span>
      </div>
    </div>
    <div class="bar-actions">
      ${onMap ? '' : '<button type="button" data-action="map">Map</button>'}
      <button type="button" data-action="tell">Tell us</button>
      <button type="button" data-action="read" aria-pressed="${state.readAloud ? 'true' : 'false'}">${readLabel}</button>
    </div>
    <div data-party-slot></div>`;
}

function bannerHtml(): string {
  if (!isUpdateReady()) return '';
  return `<div class="update-banner"><button type="button" data-action="reload-update">Update ready</button></div>`;
}

function mapHtml(view: View): string {
  const farms = COLORS.map((color) => `
    <button type="button" class="farm-card" data-goto-farm="${color}" aria-label="${COLOR_LABEL[color]} farm">
      <span class="wood-sign">
        <img src="${art(potatoArt(color))}" alt="" draggable="false">
        <span>${COLOR_LABEL[color]}</span>
      </span>
    </button>`).join('');
  return `<section class="map-screen" data-walk style="background-image:url('${art('art/map-bg.webp')}')">
    <div class="map-body">
      <div class="map-side">
        <div class="companions">
          <div class="stroll-player">${dollHtml()}</div>
          <div class="stroll-pet">${petHtml(view.happy)}</div>
        </div>
        <p class="name-tag" data-pet-label>${esc(state.petName)}</p>
      </div>
      <div class="map-main">
        <p class="hint">Pick a place to go.</p>
        <div class="farm-grid">${farms}</div>
        <div class="dest-grid">
          <button type="button" data-goto="shop">Shop</button>
          <button type="button" data-goto="dress">Dress up</button>
          <button type="button" data-goto="house">My house</button>
          <button type="button" data-action="whatsnew">What's new</button>
          <button type="button" data-action="grownups">Grown-ups</button>
          <button type="button" data-action="party">Play together</button>
        </div>
        <div data-update-slot>${bannerHtml()}</div>
      </div>
    </div>
    <div class="people-layer" data-people></div>
  </section>`;
}

function farmHtml(view: View): string {
  const color = view.route.farm ?? 'blue';
  const plots = (partyFarm() ?? state.plots)[color].map((plot, index) => `
    <button type="button" class="plot" data-plot="${index}" data-stage="${plot.stage}" data-grow="" aria-label="${esc(plotLabel(plot, color))}">
      ${plotInner(color, plot, '')}
    </button>`).join('');
  return `<section class="farm-screen" data-walk data-farm="${color}" style="background-image:url('${art(`art/farm-${color}.webp`)}')">
    <div class="farm-hero">
      <p class="hint">Tap soil to plant. Tap again to water. Then pick the potato.</p>
    </div>
    <div class="plot-grid">${plots}</div>
    <div class="farm-bottom">
      <div class="farm-cast">
        ${dollHtml()}
        ${petHtml(view.happy)}
      </div>
      <div class="basket" data-basket>
        <img src="${art('art/basket.webp')}" alt="" draggable="false">
        <span>Basket</span>
      </div>
    </div>
    <div class="people-layer" data-people></div>
  </section>`;
}

function itemCard(item: Item, selected: boolean): string {
  const owned = owns(item.id);
  return `<button type="button" class="item-card" data-item="${item.id}" data-price="${item.price}" data-owned="${owned ? 'true' : 'false'}" aria-pressed="${selected ? 'true' : 'false'}">
    <img class="item-art" src="${art(item.art)}" alt="" draggable="false">
    <span class="item-name">${esc(item.name)}</span>
    <span class="item-price">${owned ? 'Yours' : String(item.price)}</span>
  </button>`;
}

function shopHtml(view: View): string {
  const items = SHOP_ITEMS.filter((item) => item.tab === view.shopTab);
  const selected = view.selectedItem;
  const item = selected ? itemById(selected) : undefined;
  const canTrade = !!item && !owns(item.id) && state.counter.length >= item.price;
  const tabs: { id: ShopTab; label: string }[] = [
    { id: 'clothes', label: 'Clothes' },
    { id: 'hats', label: 'Hats' },
    { id: 'pets', label: 'Pets' },
    { id: 'house', label: 'House' },
  ];
  const pocket = COLORS.filter((color) => state.potatoes[color] > 0).map((color) => `
    <button type="button" data-pocket-potato data-color="${color}" aria-label="${color} potato">
      <img src="${art(potatoArt(color))}" alt="" draggable="false">
      <span class="badge">${state.potatoes[color]}</span>
    </button>`).join('');
  return `<section class="shop-screen" style="background-image:url('${art('art/shop-bg.webp')}')">
    <div class="keeper-row">
      <img class="keeper" src="${art('art/shopkeeper.webp')}" alt="Shopkeeper" draggable="false">
      <p data-shop-speech>${esc(shopSpeech(selected))}</p>
    </div>
    <div class="tabs">
      ${tabs.map((tab) => `<button type="button" data-tab="${tab.id}" aria-pressed="${tab.id === view.shopTab ? 'true' : 'false'}">${tab.label}</button>`).join('')}
    </div>
    <div class="item-grid">${items.map((entry) => itemCard(entry, entry.id === selected)).join('')}</div>
    <div class="pay-row">
      <div class="counter-zone" data-counter>
        <div class="count-num" data-counter-count aria-live="polite">${state.counter.length}</div>
        <p>Counter</p>
      </div>
      <div class="pocket" data-pocket>${pocket || '<p class="hint">Farm some potatoes first.</p>'}</div>
    </div>
    <button type="button" data-action="trade" ${canTrade ? '' : 'disabled'}>Trade</button>
  </section>`;
}

function choiceButton(item: Item, pressed: boolean, attr: string): string {
  const owned = owns(item.id);
  return `<button type="button" ${attr}="${item.id}" data-owned="${owned ? 'true' : 'false'}" aria-pressed="${pressed ? 'true' : 'false'}" ${owned ? '' : 'disabled'}>
    ${item.art ? `<img src="${art(item.art)}" alt="" draggable="false">` : ''}
    <span>${esc(item.name)}</span>
  </button>`;
}

function dressHtml(view: View): string {
  const tabs: { id: DressTab; label: string }[] = [
    { id: 'clothes', label: 'Clothes' },
    { id: 'hats', label: 'Hats' },
    { id: 'pets', label: 'Pets' },
  ];
  let choices = '';
  if (view.dressTab === 'clothes') {
    choices = OUTFITS.map((item) => choiceButton(item, state.outfit === item.id, 'data-wear')).join('');
  } else if (view.dressTab === 'hats') {
    choices = ACCESSORIES.map((item) => choiceButton(item, state.accessory === item.id, 'data-wear-acc')).join('');
  } else {
    choices = PETS.map((item) => choiceButton(item, state.pet === item.id, 'data-choose-pet')).join('');
  }
  return `<section class="dress-screen" style="background-image:url('${art('art/dress-bg.webp')}')">
    <div class="dress-stage">
      <div class="dress-doll">
        ${dollHtml()}
        ${petHtml(view.happy)}
      </div>
      <div class="dress-side">
        <label class="name-line">Name your potato
          <input data-pet-name aria-label="Name your potato" maxlength="12" value="${esc(state.petName)}" autocomplete="off">
        </label>
        <p class="name-tag" data-pet-label>${esc(state.petName)}</p>
        <div class="tabs">
          ${tabs.map((tab) => `<button type="button" data-dress-tab="${tab.id}" aria-pressed="${tab.id === view.dressTab ? 'true' : 'false'}">${tab.label}</button>`).join('')}
        </div>
        <div class="choice-grid">${choices}</div>
      </div>
    </div>
  </section>`;
}

function houseHtml(view: View): string {
  const placed = state.placed.map((piece) => {
    const item = itemById(piece.id);
    if (!item) return '';
    const selected = view.selectedFurn === piece.id;
    return `<button type="button" class="placed${selected ? ' selected' : ''}" data-placed="${item.id}" data-x="${Math.round(piece.x)}" data-y="${Math.round(piece.y)}" style="left:${piece.x}%;top:${piece.y}%" aria-label="${esc(item.name)}">
      <img src="${art(item.art)}" alt="" draggable="false">
    </button>`;
  }).join('');
  const tray = FURNITURE.map((item) => {
    const out = state.placed.some((piece) => piece.id === item.id);
    return `<button type="button" data-furn="${item.id}" aria-pressed="${view.selectedFurn === item.id ? 'true' : 'false'}" aria-label="${esc(item.name)}" ${owns(item.id) ? '' : 'disabled'}>
      <img src="${art(item.art)}" alt="" draggable="false">
      <span>${out ? 'Out' : item.name.split(' ').slice(-1)[0]}</span>
    </button>`;
  }).join('');
  const selected = view.selectedFurn ? itemById(view.selectedFurn) : undefined;
  const isPlaced = !!selected && state.placed.some((piece) => piece.id === selected.id);
  const canPlace = !!selected && owns(selected.id) && !isPlaced;
  let status = 'Tap a picture, then Place.';
  if (selected && !owns(selected.id)) status = `${selected.name} is in the shop.`;
  else if (selected && isPlaced) status = `${selected.name} is in the room. Drag it, or put it away.`;
  else if (selected) status = `${selected.name}. Tap Place.`;
  const outfit = itemById(state.outfit) ?? OUTFITS[0];
  return `<section class="house-screen">
    <div class="room" data-room style="background-image:url('${art('art/house-bg.webp')}')">
      <img class="room-friend" alt="" src="${art(outfit.art)}" draggable="false">
      ${placed}
    </div>
    <p class="hint" data-house-status>${esc(status)}</p>
    <div class="house-actions">
      <button type="button" data-action="place" ${canPlace ? '' : 'disabled'}>Place</button>
      <button type="button" data-action="put-away" ${isPlaced ? '' : 'disabled'}>Put away</button>
    </div>
    <div class="furn-tray">${tray}</div>
  </section>`;
}

function grownupsHtml(view: View): string {
  if (!view.grownupsUnlocked) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'ok'];
    return `<section class="panel-screen">
      <p>Grown-ups only. What is 17 × 6?</p>
      <output data-gate-entry>${esc(view.gateEntry)}</output>
      <div class="keys">
        ${keys.map((key) => `<button type="button" data-key="${key}">${key === 'clear' ? 'Clear' : key === 'ok' ? 'Enter' : key}</button>`).join('')}
      </div>
      <p data-gate-msg ${view.gateMessage ? '' : 'hidden'}>${esc(view.gateMessage)}</p>
    </section>`;
  }
  const pageSize = 3;
  const start = view.feedbackPage * pageSize;
  const notes = state.feedback.slice(start, start + pageSize);
  const list = notes.length
    ? notes.map((note) => `<li data-feedback-item>${esc(note.type)} · ${esc(note.note)} · ${esc(note.screen)}</li>`).join('')
    : '<li>No notes yet.</li>';
  return `<section class="panel-screen">
    <p data-version>Version v${esc(APP_VERSION)}</p>
    <button type="button" data-action="check-updates">Check for updates</button>
    <p data-update-status>${esc(view.updateStatus)}</p>
    <button type="button" data-action="whatsnew">What's new</button>
    <button type="button" data-action="sound" aria-pressed="${state.sound ? 'true' : 'false'}">${state.sound ? 'Sound on' : 'Sound off'}</button>
    <ul data-feedback-list>${list}</ul>
    <div class="pager">
      <button type="button" data-action="feedback-prev">Back</button>
      <button type="button" data-action="feedback-next">Next</button>
    </div>
  </section>`;
}

function whatsNewHtml(): string {
  const lines = WHATS_NEW.map((line) => `<li>${esc(line)}</li>`).join('');
  return `<section class="panel-screen">
    <h2>What's new in v${esc(APP_VERSION)}</h2>
    <ul>${lines}</ul>
  </section>`;
}

export function stageHtml(view: View): string {
  switch (view.route.screen) {
    case 'farm':
      return farmHtml(view);
    case 'shop':
      return shopHtml(view);
    case 'dress':
      return dressHtml(view);
    case 'house':
      return houseHtml(view);
    case 'grownups':
      return grownupsHtml(view);
    case 'whatsnew':
      return whatsNewHtml();
    default:
      return mapHtml(view);
  }
}

function codePicturesHtml(raw: string): string {
  const digits = raw.padEnd(4, ' ').slice(0, 4).split('');
  return digits.map((digit) => {
    const pic = pictureFor(digit);
    if (!pic) return '<span class="code-pic empty"></span>';
    return `<span class="code-pic"><img alt="${esc(pic.word)}" src="${art(pic.art)}" draggable="false"><span>${esc(pic.word)}</span></span>`;
  }).join('');
}

export function partySlotHtml(): string {
  const snap = partySnapshot();
  if (snap.status === 'idle') return '';
  const elsewhere = friendsElsewhere().map((friend) => `
    <button type="button" class="elsewhere" data-goto-friend="${friend.farm}">${esc(friend.name)} is at the ${COLOR_LABEL[friend.farm]} Farm – go there?</button>`).join('');
  const playing = snap.status === 'connected' || snap.status === 'napping';
  const emotes = playing
    ? `<button type="button" class="emote" data-emote="heart" aria-label="Heart"><img src="${art('art/heart.webp')}" alt="" draggable="false"></button>
       <button type="button" class="emote" data-emote="wave" aria-label="Wave"><img src="${art('art/emote-wave.webp')}" alt="" draggable="false"></button>
       <button type="button" class="emote" data-emote="dance" aria-label="Potato dance"><img src="${art('art/pet-potato-happy.webp')}" alt="" draggable="false"></button>`
    : '';
  const hostCode = snap.role === 'host' && snap.code
    ? `<p class="party-code host-code" data-host-code>${esc(snap.code)}</p>`
    : '';
  return `<div class="party-bar">
    ${hostCode}
    <p class="party-msg" data-party-message>${esc(snap.message)}</p>
    ${emotes}
    <button type="button" data-action="party-leave">Alone</button>
    ${elsewhere}
  </div>`;
}

function partyModalHtml(view: View): string {
  const snap = partySnapshot();
  const presets = NAME_PRESETS.map((name) => `
    <button type="button" data-name-preset="${esc(name)}" aria-pressed="${state.playerName === name ? 'true' : 'false'}">${esc(name)}</button>`).join('');
  let body = '';
  if (view.partyPane === 'host') {
    body = `
      ${snap.qr ? `<img class="party-qr" data-party-qr alt="Party code" src="${snap.qr}">` : ''}
      <div class="code-row" data-code-pictures>${codePicturesHtml(snap.code)}</div>
      <p class="party-code" data-party-code>${esc(snap.code)}</p>
      <p class="party-msg" data-party-message>${esc(snap.message || 'Opening the farm party…')}</p>
      <p class="hint">Only a friend with this code can join.</p>
      <button type="button" data-action="party-close">Let's play</button>`;
  } else if (view.partyPane === 'scan') {
    body = `
      <video data-scan-video playsinline muted autoplay></video>
      <p data-scan-note>${esc(view.scanNote)}</p>
      <button type="button" data-action="party-close">Close</button>`;
  } else if (view.partyPane === 'join') {
    body = `
      <label class="name-line">Your name
        <input data-player-name aria-label="Your name" maxlength="12" value="${esc(state.playerName)}" autocomplete="off">
      </label>
      <div class="name-presets">${presets}</div>
      <label class="name-line">Friend's code
        <input data-join-code aria-label="Friend's code" inputmode="numeric" maxlength="4" value="${esc(view.joinCode)}" autocomplete="off">
      </label>
      <div class="code-row" data-code-pictures>${codePicturesHtml(view.joinCode)}</div>
      <p class="party-msg" data-party-message>${esc(snap.message)}</p>
      <button type="button" data-action="party-join">Join</button>
      <button type="button" data-action="party-scan">Scan</button>
      <button type="button" data-action="party-close">Close</button>`;
  } else {
    body = `
      <label class="name-line">Your name
        <input data-player-name aria-label="Your name" maxlength="12" value="${esc(state.playerName)}" autocomplete="off">
      </label>
      <div class="name-presets">${presets}</div>
      <button type="button" data-action="party-start">Start a farm party</button>
      <button type="button" data-action="party-join-pane">Join</button>`;
  }
  return `<div class="modal" data-modal="party">
    <div class="modal-card" role="dialog" aria-label="Play together">
      <h2>Play together</h2>
      ${body}
      ${view.partyPane === 'pick' ? '<button type="button" data-action="party-close">Close</button>' : ''}
    </div>
  </div>`;
}

export function modalHtml(view: View): string {
  if (view.partyOpen) return partyModalHtml(view);
  if (!view.tellOpen) return '';
  const draft: Note = {
    id: 'draft',
    type: view.noteType,
    note: view.noteText,
    screen: screenLabel(view.route),
    version: APP_VERSION,
    device: typeof navigator === 'undefined' ? '' : `${navigator.userAgent} | ${window.innerWidth}x${window.innerHeight}`,
    timestamp: new Date().toISOString(),
  };
  return `<div class="modal" data-modal="tell">
    <div class="modal-card" role="dialog" aria-label="Tell us">
      <h2>Tell us</h2>
      <div class="tabs">
        <button type="button" data-feedback-type="bug" aria-pressed="${view.noteType === 'bug' ? 'true' : 'false'}">A bug</button>
        <button type="button" data-feedback-type="idea" aria-pressed="${view.noteType === 'idea' ? 'true' : 'false'}">An idea</button>
      </div>
      <textarea data-feedback-note maxlength="400" placeholder="Write a note" aria-label="Your note">${esc(view.noteText)}</textarea>
      <button type="button" data-action="feedback-save">Save</button>
      <a class="btn" data-action="mailto" href="${esc(mailtoHref(draft))}">Send to Mum</a>
      <button type="button" data-action="close-modal">Close</button>
      <p data-feedback-status>${esc(view.noteStatus)}</p>
    </div>
  </div>`;
}

export function screenIntro(route: Route): string {
  switch (route.screen) {
    case 'farm':
      return `This is the ${route.farm} farm. Tap the soil to plant. Tap again to water. Then pick the potato.`;
    case 'shop':
      return 'Potato Trade Deals. Drag potatoes onto the counter.';
    case 'dress':
      return 'Dress up. Tap clothes to wear them. You can name your potato.';
    case 'house':
      return 'My house. Tap a thing, then Place. Drag it to move.';
    case 'grownups':
      return 'Grown-ups only.';
    case 'whatsnew':
      return 'What is new in Potato Region.';
    default:
      return `Potato Region. Your potato is named ${state.petName}. Pick a place to go.`;
  }
}
