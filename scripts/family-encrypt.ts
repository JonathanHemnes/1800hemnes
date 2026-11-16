/**
 * Seals the family records for the unlisted page.
 *
 * Reads the plain records from private/family.ts, the map's places from
 * private/places.ts, and the passphrase from FAMILY_PASSPHRASE or
 * private/passphrase.txt (all gitignored), checks the records, puts each
 * place they mention on the map, and writes src/data/family.enc.json: AES-256-GCM with a key from
 * PBKDF2-SHA-256. Only that file is committed. Run it after any edit:
 *
 *   npm run family:encrypt
 *
 * The same passphrase keeps the same salt, so browsers that chose "Remember
 * on this device" stay unlocked. A new passphrase gets a new salt, and every
 * browser is asked for the new one.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { data as records, validate } from '../private/family.ts';
import { gazetteer, notOnMap } from '../private/places.ts';
import { normalizePassphrase, type FamilyData, type Pin, type PinKind, type Sealed } from '../src/lib/family-data.ts';

const OUT = new URL('../src/data/family.enc.json', import.meta.url);
const PASS_FILE = new URL('../private/passphrase.txt', import.meta.url);
/* OWASP's 2023 floor for PBKDF2-SHA-256. About half a second on a phone. */
const ITERATIONS = 600_000;

const passphrase = normalizePassphrase(
  process.env.FAMILY_PASSPHRASE ?? (existsSync(PASS_FILE) ? readFileSync(PASS_FILE, 'utf8') : ''),
);
if (passphrase.length < 8) {
  console.error('Set a passphrase of at least 8 characters in private/passphrase.txt or FAMILY_PASSPHRASE.');
  process.exit(1);
}

validate();

/* ── Places ──────────────────────────────────────────────────────────── */

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/gi;
const pins = new Map<string, Pin>();
const missing = new Set<string>();

/** Every gazetteer place a bit of record text names, most specific first. */
function placesIn(text: string) {
  const hits = gazetteer.filter((entry) => entry.match.some((needle) => text.includes(needle)));
  return hits.filter((hit) => !hits.some((other) => other.within === hit.id));
}

function pin(text: string | undefined, kind: PinKind, people: string[]) {
  if (!text) return;
  const found = placesIn(text);
  /* A bare date ("Aug 1, 1936") names no place; anything else unmatched gets reported. */
  if (!found.length && !notOnMap.some((skip) => text.includes(skip)) && /[a-z]/i.test(text.replace(MONTH, ''))) missing.add(text);
  for (const place of found) {
    const key = `${place.id} ${kind}`;
    const entry = pins.get(key) ?? { place: place.id, kind, people: [] };
    for (const id of people) if (!entry.people.includes(id)) entry.people.push(id);
    pins.set(key, entry);
  }
}

for (const person of records.people) {
  pin(person.bornPlace, 'born', [person.id]);
  pin(person.lived, 'lived', [person.id]);
  pin(person.diedPlace, 'died', [person.id]);
  pin(person.buried, 'buried', [person.id]);
}
for (const union of records.unions) {
  pin(union.married, 'married', union.partners);
  pin(union.lived, 'lived', union.partners);
}

const used = new Set([...pins.values()].map((entry) => entry.place));
const data: FamilyData = {
  ...records,
  places: gazetteer.filter((entry) => used.has(entry.id)).map(({ id, name, lat, lng }) => ({ id, name, lat, lng })),
  pins: [...pins.values()],
};

if (missing.size) {
  console.warn(
    `Not on the map (add to private/places.ts, or to notOnMap there):\n${[...missing].map((text) => `  ${text}`).join('\n')}`,
  );
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));

async function deriveKey(salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** The old file's salt and contents, if this passphrase still opens it. */
async function previous() {
  if (!existsSync(OUT)) return null;
  const old: Sealed = JSON.parse(readFileSync(OUT, 'utf8'));
  if (old.kdf.iterations !== ITERATIONS) return null;
  const salt = unb64(old.salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(old.iv) }, await deriveKey(salt), unb64(old.data));
    return { salt, json: gunzipSync(new Uint8Array(plain)).toString('utf8') };
  } catch {
    return null;
  }
}

const json = JSON.stringify(data);
const old = await previous();
if (old?.json === json) {
  console.log('Nothing changed; src/data/family.enc.json is current.');
  process.exit(0);
}

const salt = old?.salt ?? crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(salt), gzipSync(json, { level: 9 }));

const out: Sealed = {
  v: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS },
  salt: b64(salt),
  iv: b64(iv),
  data: b64(new Uint8Array(sealed)),
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(
  `Sealed ${data.people.length} people and ${data.places.length} places into src/data/family.enc.json (${Math.round(out.data.length / 1024)} KB, ${
    old ? 'same passphrase' : 'new passphrase: remembered browsers will be asked again'
  }).`,
);
