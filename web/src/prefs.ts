/** Preferences model (spec Screen 04). Mirrors `Preferences` + catalogs in `crates/common/src/lib.rs`. */
export type Preferences = {
  relationship_style: string;
  interests: string[];
  boundaries: string[];
  show_me: string[];
  discoverable: boolean;
  public_relationship_style: boolean;
  public_interests: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  relationship_style: '',
  interests: [],
  boundaries: [],
  show_me: ['male', 'female', 'non_binary'], // everyone; the server reads an empty list the same way
  discoverable: true,
  public_relationship_style: false,
  public_interests: true,
};

/** Server enum `PlayerIntent` (snake_case). Labels follow the spec's wording. */
export const INTENTS = [
  { id: 'socialize', label: 'Meet people', icon: '👋' },
  { id: 'flirt', label: 'Flirt', icon: '😏' },
  { id: 'casual_dating', label: 'Date', icon: '🍸' },
  { id: 'explore', label: 'Explore casual', icon: '✨' },
  { id: 'relationship', label: 'Find a relationship', icon: '💞' },
];

export const RELATIONSHIP_STYLES = [
  { id: 'casual_dating', label: 'Casual dating' },
  { id: 'committed', label: 'Committed' },
  { id: 'non_exclusive', label: 'Non-exclusive' },
  { id: 'open', label: 'Open to different arrangements' },
];

export const INTERESTS = [
  'Afrobeats', 'Amapiano', 'Rooftop parties', 'Lounges & cocktails', 'Dancing', 'Food spots',
  'Live music', 'Art & fashion', 'Beach days', 'Gaming', 'Fitness', 'Movies',
];
export const MAX_INTERESTS = 5;
export const MAX_BIO_CHARS = 160;

/** Invitation types (spec Screen 10). Boundaries opt out of these. */
export const INVITATION_TYPES = [
  { id: 'public_date', label: 'Public dates' },
  { id: 'venue_visit', label: 'Venue visits' },
  { id: 'private_location', label: 'Private locations' },
];

export const SHOW_ME = [
  { id: 'male', label: 'Men' },
  { id: 'female', label: 'Women' },
  { id: 'non_binary', label: 'Non-binary people' },
];

export const labelOf = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;
