/** Appearance model shared with the backend (snake_case matches the Rust `AvatarLook`). */
export type Look = {
  gender: string;
  skin_tone: number;
  hair_color: string;
  /** Legacy: picks the frame for non-binary looks (> 0.5 = feminine) and a default hair style for old looks. */
  hair_length: number;
  body_type: number;
  face: [number, number, number, number];
  top: string;
  bottom: string;
  accessory: string;
  style: string;
  /** `HAIR_STYLES` id; empty = derived from `hair_length`. */
  hair_style?: string;
  /** `SHOES` id; empty = the frame's default pair. */
  shoes?: string;
  /** `#rrggbb` overrides for the top and bottom; empty = the item's own colour. */
  top_color?: string;
  bottom_color?: string;
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
  hair_style: 'short',
  shoes: 'sneakers',
  top_color: '',
  bottom_color: '',
};

export type Frame = 'male' | 'female';
/** Which modular body a look uses (ADR 0017): male/female, and non-binary picks by `hair_length`. */
export const frameOf = (look: Look): Frame => (look.gender === 'female' ? 'female' : look.gender === 'male' ? 'male' : look.hair_length > 0.5 ? 'female' : 'male');

/**
 * A wearable: `parts[frame]` is the outfit set in `public/characters/<frame>.glb` (`<Set>_Body|Legs|Feet`) and the
 * material on it that takes the colour. Items missing a frame aren't offered to it. `kind` and `color` also drive the
 * primitive placeholder shown while the model loads.
 */
export type Item = { id: string; label: string; color: string; kind: string; icon: string; parts: Partial<Record<Frame, [set: string, material: string]>> };

export const TOPS: Item[] = [
  { id: 'tee_white', label: 'Tee', color: '#e9e9ee', kind: 'tee', icon: '👕', parts: { male: ['Casual2', 'LightBrown'], female: ['Casual', 'White'] } },
  { id: 'tee_black', label: 'Black tee', color: '#16161a', kind: 'tee', icon: '👕', parts: { male: ['Casual2', 'LightBrown'], female: ['Casual', 'White'] } },
  { id: 'jacket_denim', label: 'Hoodie', color: '#3d5a80', kind: 'jacket', icon: '🧥', parts: { male: ['Casual', 'Purple'] } },
  { id: 'jacket_red', label: 'Red hoodie', color: '#b3262e', kind: 'jacket', icon: '🧥', parts: { male: ['Casual', 'Purple'] } },
  { id: 'blazer_tan', label: 'Blazer', color: '#b8925a', kind: 'blazer', icon: '🥼', parts: { male: ['Suit', 'Suit'], female: ['Suit', 'Black'] } },
  { id: 'shirt_white', label: 'White suit', color: '#f2f2f2', kind: 'shirt', icon: '👔', parts: { male: ['Suit', 'Suit'], female: ['Suit', 'Black'] } },
  { id: 'cami_yellow', label: 'Crop top', color: '#e7b416', kind: 'cami', icon: '🎽', parts: { female: ['Punk', 'Pink'] } },
  { id: 'tank', label: 'Tank top', color: '#e7b416', kind: 'cami', icon: '🎽', parts: { male: ['Beach', 'LightBrown'] } },
  { id: 'dress_red', label: 'Dress', color: '#c0182a', kind: 'dress', icon: '👗', parts: { female: ['Formal', 'LimeGreen'] } },
  { id: 'vest_leather', label: 'Leather vest', color: '#1b1b1f', kind: 'jacket', icon: '🦺', parts: { male: ['Punk', 'Black'] } },
  { id: 'utility', label: 'Utility shirt', color: '#5d6b3a', kind: 'shirt', icon: '👕', parts: { male: ['Adventurer', 'Green'], female: ['Adventurer', 'LightGreen'] } },
  { id: 'overalls', label: 'Dungarees', color: '#3d5a80', kind: 'shirt', icon: '👖', parts: { male: ['Farmer', 'LightBlue'] } },
];

export const BOTTOMS: Item[] = [
  { id: 'jeans', label: 'Jeans', color: '#2f4a7a', kind: 'trousers', icon: '👖', parts: { male: ['Casual2', 'LightBlue'], female: ['Casual', 'Orange'] } },
  { id: 'jeans_black', label: 'Black jeans', color: '#151518', kind: 'trousers', icon: '👖', parts: { male: ['Casual2', 'LightBlue'], female: ['Casual', 'Orange'] } },
  { id: 'trousers_black', label: 'Tailored', color: '#1c1c22', kind: 'trousers', icon: '👖', parts: { male: ['Suit', 'Suit'], female: ['Suit', 'Black'] } },
  { id: 'trousers_cream', label: 'Cream trousers', color: '#e6dcc6', kind: 'trousers', icon: '👖', parts: { male: ['Suit', 'Suit'], female: ['Suit', 'Black'] } },
  { id: 'ripped', label: 'Ripped jeans', color: '#2f4a7a', kind: 'trousers', icon: '👖', parts: { male: ['Punk', 'LightBlue'], female: ['Punk', 'Black'] } },
  { id: 'shorts', label: 'Shorts', color: '#4f6d9a', kind: 'trousers', icon: '🩳', parts: { male: ['Casual', 'LightBlue'], female: ['Adventurer', 'Brown_02'] } },
  { id: 'board_shorts', label: 'Beach shorts', color: '#b3262e', kind: 'trousers', icon: '🩳', parts: { male: ['Beach', 'Red_Dark'] } },
  { id: 'cargo', label: 'Cargo pants', color: '#6b5a3a', kind: 'trousers', icon: '👖', parts: { male: ['Adventurer', 'Brown2'] } },
  { id: 'skirt_lilac', label: 'Skirt', color: '#a58fd8', kind: 'skirt', icon: '🩱', parts: { female: ['Formal', 'LimeGreen'] } },
  { id: 'skirt_black', label: 'Black skirt', color: '#121214', kind: 'skirt', icon: '🩱', parts: { female: ['Formal', 'LimeGreen'] } },
];

export const SHOES: Item[] = [
  { id: 'sneakers', label: 'Sneakers', color: '#6a3fb5', kind: 'shoe', icon: '👟', parts: { male: ['Casual', 'Purple'], female: ['Casual', 'Grey'] } },
  { id: 'kicks', label: 'Court kicks', color: '#a8262e', kind: 'shoe', icon: '👟', parts: { male: ['Casual2', 'Red_Dark'] } },
  { id: 'heels', label: 'Heels', color: '#c0182a', kind: 'shoe', icon: '👠', parts: { female: ['Formal', 'Red'] } },
  { id: 'sandals', label: 'Sandals', color: '#a8262e', kind: 'shoe', icon: '🩴', parts: { male: ['Beach', 'Red_Dark'] } },
  { id: 'dress_shoes', label: 'Dress shoes', color: '#141416', kind: 'shoe', icon: '👞', parts: { male: ['Suit', 'Black'], female: ['Suit', 'Black'] } },
  { id: 'boots', label: 'Boots', color: '#141416', kind: 'shoe', icon: '🥾', parts: { male: ['Punk', 'Black'], female: ['Punk', 'Black'] } },
  { id: 'work_boots', label: 'Work boots', color: '#5a4630', kind: 'shoe', icon: '🥾', parts: { male: ['Adventurer', 'Black'], female: ['Adventurer', 'Brown2'] } },
];

/**
 * Hair styles. Modelled ones use that outfit set's head (`<Set>_Head`, hair materials listed so they take the hair
 * colour); `extra` styles are low-poly shapes on the head bone over a close-cropped head (avatar3d.ts).
 */
export type HairStyle = { id: string; label: string; heads: Partial<Record<Frame, [set: string, hairMaterials: string[]]>>; extra?: 'afro' | 'puffs' | 'locs' };
export const HAIR_STYLES: HairStyle[] = [
  { id: 'short', label: 'Short', heads: { male: ['Casual2', ['Hair']] } },
  { id: 'afro', label: 'Afro', heads: { male: ['Casual2', ['Hair']], female: ['Adventurer', ['Hair_Brown']] }, extra: 'afro' },
  { id: 'puffs', label: 'Puffs', heads: { female: ['Adventurer', ['Hair_Brown']] }, extra: 'puffs' },
  { id: 'locs', label: 'Locs', heads: { male: ['Casual2', ['Hair']], female: ['Adventurer', ['Hair_Brown']] }, extra: 'locs' },
  { id: 'curly', label: 'Curly top', heads: { male: ['Casual', ['Hair']] } },
  { id: 'side_part', label: 'Side part', heads: { male: ['Suit', ['Hair']] } },
  { id: 'waves', label: 'Waves', heads: { male: ['Beach', ['Hair']] } },
  { id: 'beard', label: 'Long + beard', heads: { male: ['Adventurer', ['Hair']] } },
  { id: 'bob', label: 'Bob', heads: { female: ['Casual', ['Hair_Brown', 'Hair_Blond']] } },
  { id: 'curls', label: 'Curls', heads: { female: ['Formal', ['Red']] } },
  { id: 'sleek', label: 'Sleek', heads: { female: ['Suit', ['Hair_Brown', 'Hair_Blond']] } },
  { id: 'bun', label: 'Tied back', heads: { female: ['Adventurer', ['Hair_Brown']] } },
  { id: 'mohawk', label: 'Mohawk', heads: { male: ['Punk', ['Red', 'Red_Dark']], female: ['Punk', ['Pink']] } },
];

export const ACCESSORIES: Item[] = [
  { id: 'none', label: 'None', color: '#000000', kind: 'none', icon: '—', parts: {} },
  { id: 'fedora', label: 'Fedora', color: '#2a2320', kind: 'hat', icon: '🎩', parts: {} },
  { id: 'sunhat', label: 'Sun hat', color: '#d9b77a', kind: 'sunhat', icon: '👒', parts: {} },
  { id: 'cap', label: 'Cap', color: '#1b1b1f', kind: 'cap', icon: '🧢', parts: {} },
  { id: 'glasses', label: 'Glasses', color: '#222222', kind: 'glasses', icon: '👓', parts: {} },
  { id: 'shades', label: 'Shades', color: '#050505', kind: 'shades', icon: '🕶️', parts: {} },
];

export const STYLES = [
  { id: 'streetwear', label: 'Streetwear', icon: '🧢', outfit: { top: 'tee_black', bottom: 'jeans_black', accessory: 'cap', shoes: 'sneakers' } },
  { id: 'classic', label: 'Classic', icon: '🤵', outfit: { top: 'blazer_tan', bottom: 'trousers_black', accessory: 'none', shoes: 'dress_shoes' } },
  { id: 'glam', label: 'Glam', icon: '✨', outfit: { top: 'dress_red', bottom: 'skirt_black', accessory: 'shades', shoes: 'heels' } },
];

export const HAIR_COLORS = ['#0d0a09', '#3b2416', '#7a4a26', '#c9a227', '#e7d6a8', '#9a9a9a', '#d63a3a', '#3fbf5a', '#3a7bd5', '#b04fd6'];
/** Clothing swatches: neutrals first, then Lagos-night brights. */
export const CLOTH_COLORS = ['#f2f2f2', '#16161a', '#6b6b73', '#e6dcc6', '#2f4a7a', '#5d6b3a', '#7a4a26', '#c0182a', '#ff2f91', '#b04fd6', '#3a7bd5', '#1fb5a5', '#e7b416', '#f07a2a'];

export const PARTNER_TRAITS = [
  { id: 'Adventurous', icon: '😈' },
  { id: 'Career-Focused', icon: '💰' },
  { id: 'Caring', icon: '❤️' },
  { id: 'Humorous', icon: '😂' },
  { id: 'Reserved', icon: '🔒' },
];

export const findItem = (list: Item[], id: string) => list.find((i) => i.id === id) ?? list[0];
/** Items a frame can wear. */
export const forFrame = (list: Item[], frame: Frame) => list.filter((i) => i.parts[frame]);
export const hairFor = (frame: Frame) => HAIR_STYLES.filter((h) => h.heads[frame]);

/** The item actually drawn: the chosen one when the frame has it, else the frame's first. */
export function resolveItem(list: Item[], id: string | undefined, frame: Frame): Item {
  const own = list.find((i) => i.id === id);
  return own?.parts[frame] ? own : forFrame(list, frame)[0];
}
export function resolveHair(look: Look, frame: Frame): HairStyle {
  const own = HAIR_STYLES.find((h) => h.id === look.hair_style);
  if (own?.heads[frame]) return own;
  // Older looks only have `hair_length`.
  const fallback = frame === 'female' ? (look.hair_length > 0.6 ? 'curls' : 'bob') : look.hair_length > 0.6 ? 'beard' : 'short';
  return HAIR_STYLES.find((h) => h.id === fallback)!;
}
export const DEFAULT_SHOES: Record<Frame, string> = { male: 'sneakers', female: 'sneakers' };

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
  const base: Look = {
    gender,
    // Lagos first: most random looks land on deeper tones.
    skin_tone: Math.round(Math.random() ** 1.6 * 100) / 100,
    hair_color: pick(HAIR_COLORS.slice(0, 4)),
    hair_length: gender === 'female' ? 0.5 + Math.random() * 0.5 : Math.random() * 0.4,
    body_type: Math.round(Math.random() * 100) / 100,
    face: [r(), r(), r(), r()],
    top: style.outfit.top,
    bottom: style.outfit.bottom,
    accessory: pick(ACCESSORIES).id,
    style: style.id,
    top_color: Math.random() < 0.5 ? pick(CLOTH_COLORS) : '',
    bottom_color: '',
  };
  const frame = frameOf(base);
  return {
    ...base,
    top: pick(forFrame(TOPS, frame)).id,
    bottom: pick(forFrame(BOTTOMS, frame)).id,
    shoes: pick(forFrame(SHOES, frame)).id,
    hair_style: pick(hairFor(frame)).id,
  };
}

/** Deterministic, shareable code for the "Identity complete" card. */
export function matchCode(seed: string): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `#${(Math.abs(h) % 9_000_000_000 + 1_000_000_000).toString()}`;
}
