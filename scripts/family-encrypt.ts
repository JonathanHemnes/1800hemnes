/**
 * Seals the family records for the unlisted page.
 *
 * Reads the plain records from private/family.ts and the passphrase from
 * FAMILY_PASSPHRASE or private/passphrase.txt (both gitignored), checks the
 * records, and writes src/data/family.enc.json: AES-256-GCM with a key from
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
import { data, validate } from '../private/family.ts';
import { normalizePassphrase, type Sealed } from '../src/lib/family-data.ts';

const OUT = new URL('../src/data/family.enc.json', import.meta.url);
const PASS_FILE = new URL('../private/passphrase.txt', import.meta.url);
/* OWASP's 2023 floor for PBKDF2-SHA-256. About half a second on a phone. */
const ITERATIONS = 600_000;

const passphrase = normalizePassphrase(
  process.env.FAMILY_PASSPHRASE ?? (existsSync(PASS_FILE) ? readFileSync(PASS_FILE, 'utf8') : ''),
);
if (passphrase.length < 16) {
  console.error('Set a passphrase of at least 16 characters in private/passphrase.txt or FAMILY_PASSPHRASE.');
  process.exit(1);
}

validate();

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
  `Sealed ${data.people.length} people into src/data/family.enc.json (${Math.round(out.data.length / 1024)} KB, ${
    old ? 'same passphrase' : 'new passphrase: remembered browsers will be asked again'
  }).`,
);
