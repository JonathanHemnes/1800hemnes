/**
 * Shapes of the family records, and the place the page keeps them once
 * they are unlocked. The records themselves are never in the repository in
 * plain text: they live in private/family.ts (gitignored) and are committed
 * only as src/data/family.enc.json. See scripts/family-encrypt.ts.
 */

export type Sex = 'm' | 'f' | 'u';

export interface Person {
  id: string;
  name: string;
  sex: Sex;
  /** Nicknames, married names, other spellings. */
  aka?: string[];
  born?: string;
  bornPlace?: string;
  died?: string;
  diedPlace?: string;
  buried?: string;
  lived?: string;
  notes?: string[];
}

export interface Union {
  /** One or two people. One means the other parent is not recorded. */
  partners: string[];
  children: string[];
  married?: string;
  ended?: string;
  lived?: string;
  notes?: string[];
}

export interface Line {
  id: string;
  name: string;
  /** The earliest recorded ancestor; the line is drawn as their descendants. */
  root: string;
  origin: string;
}

export interface FamilyData {
  /** One sentence under the page title. */
  intro: string;
  source: { title: string; credit: string };
  lines: Line[];
  people: Person[];
  unions: Union[];
}

/** The encrypted file committed to the repository. */
export interface Sealed {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  /** Base64. */
  salt: string;
  iv: string;
  /** AES-GCM over the gzipped JSON of a FamilyData. */
  data: string;
}

/**
 * Both sides read the passphrase through this, so case and the separators
 * between words don't matter: "Maple River" opens what "maple-river" sealed.
 * Phones capitalise the first letter; people type spaces for hyphens.
 */
export const normalizePassphrase = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .split(/[\s\-_.,]+/)
    .filter(Boolean)
    .join('-');

let unlocked: FamilyData | null = null;

export function load(data: FamilyData) {
  unlocked = data;
}

export function family(): FamilyData {
  if (!unlocked) throw new Error('The family records are still locked.');
  return unlocked;
}
