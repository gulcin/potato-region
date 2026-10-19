import { COLORS, type PotatoColor } from './catalog';

export type Screen = 'map' | 'farm' | 'shop' | 'dress' | 'house' | 'grownups' | 'whatsnew';

export interface Route {
  screen: Screen;
  farm: PotatoColor | null;
}

export function parseRoute(hash = location.hash): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('farm/')) {
    const color = path.slice('farm/'.length) as PotatoColor;
    if ((COLORS as readonly string[]).includes(color)) return { screen: 'farm', farm: color };
  }
  if (path === 'shop' || path === 'dress' || path === 'house' || path === 'grownups' || path === 'whatsnew') {
    return { screen: path, farm: null };
  }
  return { screen: 'map', farm: null };
}

export function hashFor(screen: Screen, farm?: PotatoColor | null): string {
  if (screen === 'map') return '#/';
  if (screen === 'farm' && farm) return `#/farm/${farm}`;
  return `#/${screen}`;
}

export function screenLabel(route: Route): string {
  if (route.screen === 'farm' && route.farm) {
    const name = route.farm[0].toUpperCase() + route.farm.slice(1);
    return `${name} farm`;
  }
  switch (route.screen) {
    case 'map':
      return 'Map';
    case 'shop':
      return 'Potato Trade Deals';
    case 'dress':
      return 'Dress up';
    case 'house':
      return 'My house';
    case 'grownups':
      return 'Grown-ups';
    case 'whatsnew':
      return "What's new";
    default:
      return 'Map';
  }
}
