export const COLORS = [
  'blue',
  'green',
  'red',
  'purple',
  'pink',
  'orange',
  'turquoise',
  'lilac',
] as const;

export type PotatoColor = (typeof COLORS)[number];

export const PLOT_COUNT = 4;
export const GROW_MS = 2000;

export type ItemKind = 'outfit' | 'accessory' | 'pet' | 'furniture';
export type ShopTab = 'clothes' | 'hats' | 'pets' | 'house';

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  price: number;
  art: string;
  tab?: ShopTab;
}

export const ITEMS: Item[] = [
  { id: 'farm-blue', kind: 'outfit', name: 'Blue farm clothes', price: 0, art: 'art/girl-farm.webp' },
  { id: 'strap-dress', kind: 'outfit', name: 'Blue strap dress', price: 20, art: 'art/girl-strap.webp', tab: 'clothes' },
  { id: 'pink-pinafore', kind: 'outfit', name: 'Pink pinafore', price: 6, art: 'art/girl-pink.webp', tab: 'clothes' },
  { id: 'turquoise-coat', kind: 'outfit', name: 'Turquoise coat', price: 6, art: 'art/girl-coat.webp', tab: 'clothes' },
  { id: 'lilac-party', kind: 'outfit', name: 'Lilac party dress', price: 7, art: 'art/girl-party.webp', tab: 'clothes' },
  { id: 'none', kind: 'accessory', name: 'No extra', price: 0, art: '' },
  { id: 'green-headband', kind: 'accessory', name: 'Green headband', price: 10, art: 'art/acc-headband.webp', tab: 'hats' },
  { id: 'flower-crown', kind: 'accessory', name: 'Flower crown', price: 4, art: 'art/acc-crown.webp', tab: 'hats' },
  { id: 'sun-hat', kind: 'accessory', name: 'Orange sun hat', price: 5, art: 'art/acc-hat.webp', tab: 'hats' },
  { id: 'potato', kind: 'pet', name: 'Potato friend', price: 0, art: 'art/pet-potato.webp' },
  { id: 'chihuahua', kind: 'pet', name: 'Yellow chihuahua', price: 13, art: 'art/pet-chihuahua.webp', tab: 'pets' },
  { id: 'lovebird', kind: 'pet', name: 'Turquoise bird', price: 6, art: 'art/pet-bird.webp', tab: 'pets' },
  { id: 'bunny', kind: 'pet', name: 'Lilac bunny', price: 6, art: 'art/pet-bunny.webp', tab: 'pets' },
  { id: 'sofa', kind: 'furniture', name: 'Rose sofa', price: 5, art: 'art/furn-sofa.webp', tab: 'house' },
  { id: 'rug', kind: 'furniture', name: 'Leaf rug', price: 4, art: 'art/furn-rug.webp', tab: 'house' },
  { id: 'lamp', kind: 'furniture', name: 'Red lamp', price: 4, art: 'art/furn-lamp.webp', tab: 'house' },
  { id: 'books', kind: 'furniture', name: 'Book nook', price: 5, art: 'art/furn-books.webp', tab: 'house' },
  { id: 'table', kind: 'furniture', name: 'Tea table', price: 4, art: 'art/furn-table.webp', tab: 'house' },
  { id: 'chair', kind: 'furniture', name: 'Soft chair', price: 4, art: 'art/furn-chair.webp', tab: 'house' },
];

export const SHOP_ITEMS = ITEMS.filter((item) => item.price > 0);

export const FURNITURE = ITEMS.filter((item) => item.kind === 'furniture');
export const OUTFITS = ITEMS.filter((item) => item.kind === 'outfit');
export const ACCESSORIES = ITEMS.filter((item) => item.kind === 'accessory');
export const PETS = ITEMS.filter((item) => item.kind === 'pet');

export const COLOR_LABEL: Record<PotatoColor, string> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  purple: 'Purple',
  pink: 'Pink',
  orange: 'Orange',
  turquoise: 'Turquoise',
  lilac: 'Lilac',
};

export const WHATS_NEW = [
  'Welcome to Potato Region.',
  'Grow colourful potatoes on every farm.',
  'Trade them at Potato Trade Deals.',
  'Dress up, choose a pet, and fill your house.',
  'Your game stays saved on this device.',
];

export function itemById(id: string): Item | undefined {
  return ITEMS.find((item) => item.id === id);
}

export function potatoArt(color: PotatoColor): string {
  return `art/potato-${color}.webp`;
}

export function shopCost(): number {
  return SHOP_ITEMS.reduce((sum, item) => sum + item.price, 0);
}
