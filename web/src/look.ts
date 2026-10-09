/** Appearance model shared with the backend (snake_case matches the Rust `AvatarLook`). */
export type Look = {
  gender: string;
  skin_tone: number;
  hair_color: string;
  hair_length: number;
  body_type: number;
  face: [number, number, number, number];
  top: string;
  bottom: string;
  accessory: string;
  style: string;
};

export const DEFAULT_LOOK: Look = {
  gender: 'male',
  skin_tone: 0.35,
  hair_color: '#1a1110',
  hair_length: 0.3,
  body_type: 0.5,
  face: [0, 0, 0, 0],
  top: 'tee_white',
  bottom: 'jeans',
  accessory: 'none',
  style: 'streetwear',
};

export type Item = { id: string; label: string; color: string; kind: string; icon: string };

export const TOPS: Item[] = [
  { id: 'tee_white', label: 'White tee', color: '#e9e9ee', kind: 'tee', icon: '👕' },
  { id: 'tee_black', label: 'Black tee', color: '#16161a', kind: 'tee', icon: '👕' },
  { id: 'jacket_denim', label: 'Denim jacket', color: '#3d5a80', kind: 'jacket', icon: '🧥' },
  { id: 'jacket_red', label: 'Red puffer', color: '#b3262e', kind: 'jacket', icon: '🧥' },
  { id: 'blazer_tan', label: 'Tan blazer', color: '#b8925a', kind: 'blazer', icon: '🥼' },
  { id: 'shirt_white', label: 'Dress shirt', color: '#f2f2f2', kind: 'shirt', icon: '👔' },
  { id: 'cami_yellow', label: 'Silk cami', color: '#e7b416', kind: 'cami', icon: '🎽' },
  { id: 'dress_red', label: 'Red dress', color: '#c0182a', kind: 'dress', icon: '👗' },
];

export const BOTTOMS: Item[] = [
  { id: 'jeans', label: 'Jeans', color: '#2f4a7a', kind: 'trousers', icon: '👖' },
  { id: 'jeans_black', label: 'Black jeans', color: '#151518', kind: 'trousers', icon: '👖' },
  { id: 'trousers_black', label: 'Tailored', color: '#1c1c22', kind: 'trousers', icon: '👖' },
  { id: 'trousers_cream', label: 'Cream trousers', color: '#e6dcc6', kind: 'trousers', icon: '👖' },
  { id: 'skirt_lilac', label: 'Pleated skirt', color: '#a58fd8', kind: 'skirt', icon: '🩱' },
  { id: 'skirt_black', label: 'Mini skirt', color: '#121214', kind: 'skirt', icon: '🩱' },
];

export const ACCESSORIES: Item[] = [
  { id: 'none', label: 'None', color: '#000000', kind: 'none', icon: '—' },
  { id: 'fedora', label: 'Fedora', color: '#2a2320', kind: 'hat', icon: '🎩' },
  { id: 'sunhat', label: 'Sun hat', color: '#d9b77a', kind: 'sunhat', icon: '👒' },
  { id: 'cap', label: 'Cap', color: '#1b1b1f', kind: 'cap', icon: '🧢' },
  { id: 'glasses', label: 'Glasses', color: '#222222', kind: 'glasses', icon: '👓' },
  { id: 'shades', label: 'Shades', color: '#050505', kind: 'shades', icon: '🕶️' },
];

export const STYLES = [
  { id: 'streetwear', label: 'Streetwear', icon: '🧢', outfit: { top: 'tee_black', bottom: 'jeans_black', accessory: 'cap' } },
  { id: 'classic', label: 'Classic', icon: '🤵', outfit: { top: 'blazer_tan', bottom: 'trousers_black', accessory: 'none' } },
  { id: 'glam', label: 'Glam', icon: '✨', outfit: { top: 'dress_red', bottom: 'skirt_black', accessory: 'shades' } },
];

export const HAIR_COLORS = ['#0d0a09', '#3b2416', '#7a4a26', '#c9a227', '#e7d6a8', '#9a9a9a', '#d63a3a', '#3fbf5a', '#3a7bd5', '#b04fd6'];

export const PARTNER_TRAITS = [
  { id: 'Adventurous', icon: '😈' },
  { id: 'Career-Focused', icon: '💰' },
  { id: 'Caring', icon: '❤️' },
  { id: 'Humorous', icon: '😂' },
  { id: 'Reserved', icon: '🔒' },
];

export const findItem = (list: Item[], id: string) => list.find((i) => i.id === id) ?? list[0];

/** Skin tone 0 (deep) .. 1 (light) to RGB 0..1. */
export function skinRgb(t: number): [number, number, number] {
  const deep = [0.24, 0.14, 0.09];
  const light = [0.96, 0.82, 0.7];
  return deep.map((d, i) => d + (light[i] - d) * Math.max(0, Math.min(1, t))) as [number, number, number];
}

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function randomLook(gender: string): Look {
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const style = pick(STYLES);
  const r = () => Math.round((Math.random() * 2 - 1) * 100) / 100;
  return {
    gender,
    skin_tone: Math.round(Math.random() * 100) / 100,
    hair_color: pick(HAIR_COLORS.slice(0, 6)),
    hair_length: gender === 'female' ? 0.5 + Math.random() * 0.5 : Math.random() * 0.6,
    body_type: Math.round(Math.random() * 100) / 100,
    face: [r(), r(), r(), r()],
    top: style.outfit.top,
    bottom: gender === 'male' ? pick(['jeans', 'jeans_black', 'trousers_black']) : style.outfit.bottom,
    accessory: pick(ACCESSORIES).id,
    style: style.id,
  };
}

/** Deterministic, shareable code for the "Identity complete" card. */
export function matchCode(seed: string): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `#${(Math.abs(h) % 9_000_000_000 + 1_000_000_000).toString()}`;
}
