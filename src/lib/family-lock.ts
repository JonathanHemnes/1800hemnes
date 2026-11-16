/**
 * Opens the sealed family records. The page ships only ciphertext; the key
 * comes from the family passphrase (PBKDF2, then AES-GCM), so nothing
 * readable exists until someone who knows it types it in. A browser told to
 * remember keeps the derived key, never the passphrase.
 */
import sealedJson from '../data/family.enc.json';
import { load, normalizePassphrase, type FamilyData, type Sealed } from './family-data';

const sealed = sealedJson as Sealed;
const KEY_STORE = 'family:key';

const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function derive(passphrase: string) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizePassphrase(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(sealed.salt), iterations: sealed.kdf.iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt'],
  );
}

/** Throws if the key is wrong: AES-GCM refuses to decrypt rather than returning junk. */
async function open(key: CryptoKey): Promise<FamilyData> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data));
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/* The stored key is tagged with the salt it was derived for, so a new passphrase asks again. */
function storedKey() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_STORE) ?? 'null');
    return saved?.salt === sealed.salt && typeof saved.key === 'string' ? (saved.key as string) : null;
  } catch {
    return null;
  }
}

function remember(raw: ArrayBuffer | null) {
  try {
    if (raw) localStorage.setItem(KEY_STORE, JSON.stringify({ salt: sealed.salt, key: b64(raw) }));
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* Private windows can refuse storage; the page still opens, it just asks next time. */
  }
}

function fillPage(root: HTMLElement, data: FamilyData) {
  const intro = root.querySelector<HTMLElement>('[data-intro]')!;
  intro.textContent = data.intro;
  intro.hidden = false;

  /* Longest run of parent → child. */
  const kids = new Map<string, string[]>();
  for (const union of data.unions) {
    for (const partner of union.partners) kids.set(partner, [...(kids.get(partner) ?? []), ...union.children]);
  }
  const memo = new Map<string, number>();
  const span = (id: string): number => {
    if (!memo.has(id)) memo.set(id, 1 + Math.max(0, ...(kids.get(id) ?? []).map(span)));
    return memo.get(id)!;
  };
  const years = data.people.flatMap((person) => {
    const match = person.born?.match(/\b1[5-9]\d\d\b/);
    return match ? [Number(match[0])] : [];
  });
  const stats: [number, string][] = [
    [data.people.length, 'people'],
    [Math.max(...data.people.map((person) => span(person.id))), 'generations'],
    [data.lines.length, 'family lines'],
    [Math.min(...years), 'earliest birth'],
  ];
  const list = root.querySelector<HTMLElement>('[data-stats]')!;
  list.replaceChildren(
    ...stats.map(([value, label]) => {
      const item = document.createElement('li');
      const number = document.createElement('span');
      number.className = 'fam__stat';
      number.textContent = String(value);
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = label;
      item.append(number, tag);
      return item;
    }),
  );
  list.hidden = false;

  root.querySelector('[data-source-title]')!.textContent = data.source.title;
  root.querySelector('[data-source-credit]')!.textContent = data.source.credit;
}

export async function unlock(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-lock]')!;
  const input = form.querySelector<HTMLInputElement>('#fam-pass')!;
  const keep = form.querySelector<HTMLInputElement>('#fam-remember')!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const error = form.querySelector<HTMLElement>('[data-lock-error]')!;
  const app = root.querySelector<HTMLElement>('[data-app]')!;

  const show = async (data: FamilyData) => {
    load(data);
    fillPage(root, data);
    form.hidden = true;
    app.hidden = false;
    const { mount } = await import('./family-explorer');
    mount(root);
  };

  root.querySelector('[data-forget]')?.addEventListener('click', () => {
    remember(null);
    location.reload();
  });

  if (!crypto.subtle || typeof DecompressionStream === 'undefined') {
    form.hidden = false;
    error.textContent = 'This browser can’t open the records. Try a current version of Safari, Chrome, Firefox, or Edge.';
    button.disabled = true;
    return;
  }

  const saved = storedKey();
  if (saved) {
    const data = await crypto.subtle
      .importKey('raw', unb64(saved), 'AES-GCM', false, ['decrypt'])
      .then(open)
      .catch(() => null);
    if (data) return show(data);
    remember(null);
  }

  form.hidden = false;
  input.focus();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Opening…';
    const key = await derive(input.value);
    const data = await open(key).catch(() => null);
    button.disabled = false;
    button.textContent = 'Open';
    if (!data) {
      error.textContent = 'That passphrase didn’t open the records. Check it and try again.';
      input.select();
      return;
    }
    remember(keep.checked ? await crypto.subtle.exportKey('raw', key) : null);
    await show(data);
  });
}
