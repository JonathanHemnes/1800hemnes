/**
 * Client side of the unlisted family page: indexes the records, works out
 * how any two people are related, and draws the four views (Explore,
 * Ancestors, Lines, Map) into the page. State lives in the URL hash so the
 * back button and shared links work: #/explore/<id>, #/ancestors/<id>,
 * #/lines/<id>, #/map/<place>.
 *
 * Nobody is the center by default. A visitor can say who they are, which is
 * remembered in their own browser only; until then no relationships are shown.
 */
import { family, type Line, type Person, type Pin, type PinKind, type Union } from './family-data';
import type { FamilyMap, MapDot } from './family-map';

/* Imported only after the page unlocks the records; see family-lock.ts. */
const { lines, people, unions, places, pins } = family();

/* ── Index ───────────────────────────────────────────────────────────── */

const byId = new Map<string, Person>(people.map((person) => [person.id, person]));
const parentUnion = new Map<string, Union>();
const unionsOf = new Map<string, Union[]>();

for (const union of unions) {
  for (const child of union.children) parentUnion.set(child, union);
  for (const partner of union.partners) {
    const list = unionsOf.get(partner) ?? [];
    list.push(union);
    unionsOf.set(partner, list);
  }
}

const get = (id: string) => byId.get(id)!;
const SEX_ORDER = { m: 0, u: 1, f: 2 };
const fatherFirst = (a: string, b: string) => SEX_ORDER[get(a).sex] - SEX_ORDER[get(b).sex];
const parentsOf = (id: string) => [...(parentUnion.get(id)?.partners ?? [])].sort(fatherFirst);
const familiesOf = (id: string) => unionsOf.get(id) ?? [];
const partnerIn = (union: Union, id: string) => union.partners.find((other) => other !== id);
const spousesOf = (id: string) =>
  familiesOf(id).flatMap((union) => {
    const spouse = partnerIn(union, id);
    return spouse ? [spouse] : [];
  });
const childrenOf = (id: string) => familiesOf(id).flatMap((union) => union.children);

function siblingsOf(id: string) {
  const own = parentUnion.get(id);
  if (!own) return [];
  const seen = new Set([id]);
  const found: { id: string; half: boolean }[] = [];
  const add = (sibling: string, half: boolean) => {
    if (seen.has(sibling)) return;
    seen.add(sibling);
    found.push({ id: sibling, half });
  };
  own.children.forEach((child) => add(child, false));
  for (const parent of own.partners) {
    for (const union of familiesOf(parent)) {
      if (union !== own) union.children.forEach((child) => add(child, true));
    }
  }
  return found;
}

/* ── Text ────────────────────────────────────────────────────────────── */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const pad = (n: number) => String(n).padStart(2, '0');

const yearOf = (date?: string) => {
  const match = date?.match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return match ? Number(match[1]) : undefined;
};

function lifespan(person: Person) {
  const born = yearOf(person.born);
  const died = yearOf(person.died);
  if (born && died) return `${born}–${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  return '';
}

const firstName = (id: string) => get(id).name.replace(/^(Fr|Dr)\.\s+/, '').split(' ')[0];

/* ── Lines ───────────────────────────────────────────────────────────── */

/* A line's members are everyone descended from its root, plus the people they married. */
const linesOf = new Map<string, Line[]>();
const lineMembers = new Map<string, number>();
const lineDepth = new Map<string, number>();
const lineByRoot = new Map(lines.map((line) => [line.root, line]));
const descendedFrom: Set<string>[] = [];

for (const line of lines) {
  const members = new Set<string>();
  const blood = new Set<string>();
  let deepest = 0;
  const walk = (id: string, depth: number) => {
    members.add(id);
    blood.add(id);
    deepest = Math.max(deepest, depth);
    for (const union of familiesOf(id)) {
      const spouse = partnerIn(union, id);
      if (spouse) members.add(spouse);
      union.children.forEach((child) => walk(child, depth + 1));
    }
  };
  walk(line.root, 1);
  descendedFrom.push(blood);
  lineMembers.set(line.id, members.size);
  lineDepth.set(line.id, deepest);
  for (const id of members) {
    const list = linesOf.get(id) ?? [];
    list.push(line);
    linesOf.set(id, list);
  }
}

/** The earliest-born person descended from every line: where the lines meet. */
const meetingPoint =
  people
    .filter((person) => descendedFrom.every((set) => set.has(person.id)))
    .sort((a, b) => (yearOf(a.born) ?? 9999) - (yearOf(b.born) ?? 9999))[0]?.id ?? lines[0].root;

/* ── Places ──────────────────────────────────────────────────────────── */

const placeById = new Map(places.map((place) => [place.id, place]));

/** Where each person's own facts put them: person → kind → place ids. */
const placesOf = new Map<string, Map<PinKind, string[]>>();
for (const pin of pins) {
  for (const id of pin.people) {
    const kinds = placesOf.get(id) ?? new Map<PinKind, string[]>();
    kinds.set(pin.kind, [...(kinds.get(pin.kind) ?? []), pin.place]);
    placesOf.set(id, kinds);
  }
}

/* ── Relationships ───────────────────────────────────────────────────── */

type Ancestry = Map<string, { depth: number; via: string | null }>;
const ancestryCache = new Map<string, Ancestry>();

/** Everyone above `id`, with how many generations up and which child led there. */
function ancestry(id: string): Ancestry {
  const cached = ancestryCache.get(id);
  if (cached) return cached;
  const map: Ancestry = new Map([[id, { depth: 0, via: null }]]);
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    const depth = map.get(current)!.depth;
    for (const parent of parentsOf(current)) {
      if (map.has(parent)) continue;
      map.set(parent, { depth: depth + 1, via: current });
      queue.push(parent);
    }
  }
  ancestryCache.set(id, map);
  return map;
}

/** [ancestor, their child, …, the person the map was built from] */
function descentFrom(map: Ancestry, ancestor: string) {
  const chain = [ancestor];
  let step = map.get(ancestor)!.via;
  while (step) {
    chain.push(step);
    step = map.get(step)!.via;
  }
  return chain;
}

const pick = (person: Person, male: string, female: string, either: string) =>
  person.sex === 'm' ? male : person.sex === 'f' ? female : either;

function ordinal(n: number) {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

/** 1 → "great-", 2 → "2nd great-", the usual genealogy shorthand. */
const greats = (n: number) => (n <= 0 ? '' : n === 1 ? 'great-' : `${ordinal(n)} great-`);
const TIMES = ['', 'once', 'twice', 'three times'];

function lineal(generations: number, base: string) {
  return generations === 1 ? base : `${greats(generations - 2)}grand${base}`;
}

function collateral(up: number, down: number, target: Person, half: boolean) {
  const halve = (term: string) => (!half ? term : /^\d/.test(term) ? `half ${term}` : `half-${term}`);
  if (up === 1 && down === 1) return halve(pick(target, 'brother', 'sister', 'sibling'));
  if (down === 1) return halve(`${greats(up - 2)}${pick(target, 'uncle', 'aunt', 'aunt or uncle')}`);
  if (up === 1) {
    const base = pick(target, 'nephew', 'niece', 'niece or nephew');
    return halve(down === 2 ? base : `${greats(down - 3)}grand${base}`);
  }
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const removal = removed ? ` ${TIMES[removed] ?? `${removed} times`} removed` : '';
  return halve(`${ordinal(degree)} cousin${removal}`);
}

interface Kin {
  term: string;
  /** Everyone from `from` up to the common ancestor and back down to `to`. */
  path: string[];
  /** The common ancestor, or the couple when both lines come from the same marriage. */
  apex: string[];
}

function kinship(from: string, to: string): Kin | null {
  if (from === to) return { term: 'you', path: [from], apex: [] };
  const up = ancestry(from);
  const down = ancestry(to);
  const target = get(to);

  if (up.has(to)) {
    const term = lineal(up.get(to)!.depth, pick(target, 'father', 'mother', 'parent'));
    return { term, path: descentFrom(up, to).reverse(), apex: [to] };
  }
  if (down.has(from)) {
    const term = lineal(down.get(from)!.depth, pick(target, 'son', 'daughter', 'child'));
    return { term, path: descentFrom(down, from), apex: [from] };
  }

  let shared: string | null = null;
  let closest = Infinity;
  for (const [id, { depth }] of up) {
    const other = down.get(id);
    if (other && depth + other.depth < closest) {
      shared = id;
      closest = depth + other.depth;
    }
  }
  if (!shared) return null;

  const mine = up.get(shared)!;
  const theirs = down.get(shared)!;
  const myBranch = parentUnion.get(mine.via!)!;
  const half = myBranch !== parentUnion.get(theirs.via!);
  return {
    term: collateral(mine.depth, theirs.depth, target, half),
    path: [...descentFrom(up, shared).reverse(), ...descentFrom(down, shared).slice(1)],
    apex: half ? [shared] : [...myBranch.partners].sort(fatherFirst),
  };
}

interface Relation {
  /** Short form for cards: "great-aunt", "wife of 1st cousin". Empty with no viewer. */
  term: string;
  /** Full sentence for the focus card: "Your great-aunt". */
  sentence: string;
  path?: string[];
  apex?: string[];
}

/** Who the visitor said they are, or null. Relationships are read from this person. */
let me: string | null = null;
const relationCache = new Map<string, Relation>();
const NO_RELATION: Relation = { term: '', sentence: '' };

function relation(id: string): Relation {
  if (!me) return NO_RELATION;
  let found = relationCache.get(id);
  if (!found) {
    found = describe(me, id);
    relationCache.set(id, found);
  }
  return found;
}

function describe(viewer: string, id: string): Relation {
  const target = get(id);
  if (id === viewer) return { term: 'you', sentence: 'This is you' };

  const kin = kinship(viewer, id);
  if (kin) return { term: kin.term, sentence: `Your ${kin.term}`, path: kin.path, apex: kin.apex };

  /* Married to a blood relative, a stepchild of one, or a parent-in-law of one. */
  const via = (word: string, relative: string): Relation | null => {
    if (relative === viewer) return { term: word, sentence: `Your ${word}` };
    const link = kinship(viewer, relative);
    if (!link) return null;
    return {
      term: `${word} of ${link.term}`,
      sentence: `${cap(word)} of your ${link.term}`,
      path: [...link.path, id],
      apex: link.apex,
    };
  };

  const spouseWord = pick(target, 'husband', 'wife', 'spouse');
  for (const spouse of spousesOf(id)) {
    const found = via(spouseWord, spouse);
    if (found) return found;
  }

  const own = parentUnion.get(id);
  if (own) {
    const stepWord = pick(target, 'stepson', 'stepdaughter', 'stepchild');
    for (const parent of own.partners) {
      for (const stepParent of spousesOf(parent)) {
        if (own.partners.includes(stepParent)) continue;
        const found = via(stepWord, stepParent);
        if (found) return found;
      }
    }
  }

  const inLawWord = pick(target, 'father-in-law', 'mother-in-law', 'parent-in-law');
  for (const child of childrenOf(id)) {
    for (const childSpouse of spousesOf(child)) {
      const found = via(inLawWord, childSpouse);
      if (found) return found;
    }
  }

  for (const mySpouse of spousesOf(viewer)) {
    const link = kinship(mySpouse, id);
    if (!link) continue;
    const word = pick(get(mySpouse), 'husband', 'wife', 'spouse');
    return { term: `${word}’s ${link.term}`, sentence: `Your ${word}’s ${link.term}` };
  }

  return { term: 'by marriage', sentence: 'Related to you by marriage' };
}

const isDirect = (id: string) => (me ? ancestry(me).has(id) : false);

/* ── Shared pieces ───────────────────────────────────────────────────── */

function card(id: string, options: { num?: number; half?: boolean; caption?: string } = {}) {
  const person = get(id);
  const classes = ['pcard', isDirect(id) && 'is-direct', id === me && 'is-me'].filter(Boolean).join(' ');
  const meta = [lifespan(person), options.half && 'half'].filter(Boolean).join(' · ');
  const caption = options.caption ?? relation(id).term;
  return `<a class="${classes}" href="#/explore/${id}">
    ${options.num ? `<span class="pcard__num">${pad(options.num)}</span>` : ''}
    <span class="pcard__body">
      <span class="pcard__name">${esc(person.name)}</span>
      ${meta ? `<span class="pcard__meta">${esc(meta)}</span>` : ''}
      ${caption ? `<span class="pcard__rel">${esc(caption)}</span>` : ''}
    </span>
  </a>`;
}

const cards = (items: string[]) => `<ul class="cards">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

function group(label: string, body: string) {
  return `<section class="group"><h3 class="tag group__label">${label}</h3>${body}</section>`;
}

const notesList = (notes?: string[]) =>
  notes?.length ? `<ul class="notes">${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>` : '';

/* ── Explore ─────────────────────────────────────────────────────────── */

function renderStart() {
  const meeting = get(meetingPoint);
  return `<div class="start">
    <div class="start__head">
      <h2 class="start__title" tabindex="-1" data-focus-target>Start anywhere</h2>
      <p class="start__lede">Search for anyone by name or place, or begin with the earliest recorded ancestor on each line and work forward.</p>
    </div>
    ${group('Where each line begins', cards(lines.map((line) => card(line.root, { caption: `${line.name} line` }))))}
    ${group(
      'Where the lines meet',
      `<p class="start__note">All ${lines.length} lines come together in ${esc(meeting.name)}.</p>${cards([
        card(meetingPoint, { caption: `Descended from all ${lines.length} lines` }),
      ])}`,
    )}
  </div>`;
}

function renderRoute(rel: Relation, focusId: string) {
  const path = rel.path;
  if (!path || path.length < 3) return '';
  const apex = rel.apex ?? [];
  const items = path.map((id, i) => {
    const isApex = apex.includes(id);
    const label =
      isApex && apex.length === 2
        ? apex.map((a) => `<a href="#/explore/${a}">${esc(get(a).name)}</a>`).join('<span class="route__and">&amp;</span>')
        : `<a href="#/explore/${id}">${esc(get(id).name)}</a>`;
    const role = i === 0 ? ' is-start' : id === focusId ? ' is-end' : isApex ? ' is-apex' : '';
    return `<li class="route__stop${role}">${label}</li>`;
  });
  return `<div class="route">
    <h3 class="tag">How you’re connected</h3>
    <ol class="route__list">${items.join('')}</ol>
  </div>`;
}

function renderExplore(id: string) {
  const person = get(id);
  const rel = relation(id);

  const facts: { label: string; date?: string; place?: string }[] = [];
  const addFact = (label: string, date?: string, place?: string) => {
    if (date || place) facts.push({ label, date, place });
  };
  addFact('Born', person.born, person.bornPlace);
  addFact('Died', person.died, person.diedPlace);
  addFact('Buried', undefined, person.buried);
  addFact('Lived', undefined, person.lived);

  /* A place that's on the map links to it. */
  const KIND: Record<string, PinKind> = { Born: 'born', Died: 'died', Buried: 'buried', Lived: 'lived' };
  const placeHtml = (label: string, place: string) => {
    const onMap = placesOf.get(id)?.get(KIND[label])?.[0];
    return onMap ? `<a href="#/map/${onMap}">${esc(place)}</a>` : esc(place);
  };

  const factList = facts.length
    ? `<dl class="facts">${facts
        .map(({ label, date, place }) => {
          const where = place ? placeHtml(label, place) : '';
          return `<div><dt class="tag">${label}</dt><dd>${
            date ? `${esc(date)}${where ? `<span class="facts__sub">${where}</span>` : ''}` : where
          }</dd></div>`;
        })
        .join('')}</dl>`
    : `<p class="muted">No dates or places recorded.</p>`;

  const memberOf = linesOf.get(id) ?? [];
  const lineChips = memberOf.length
    ? `<div class="ex__lines">${memberOf
        .map((line) => `<a class="chip" href="#/lines/${line.id}">${esc(line.name)}</a>`)
        .join('')}</div>`
    : '';

  const parents = parentsOf(id);
  const families = familiesOf(id);
  const siblings = siblingsOf(id);
  const hasSpouse = families.some((union) => union.partners.length > 1);

  const familyBlocks = families.map((union) => {
    const spouse = partnerIn(union, id);
    const meta = [union.married && `Married ${union.married}`, union.ended, union.lived && `Lived in ${union.lived}`]
      .filter(Boolean)
      .join(' · ');
    const kids = union.children.length
      ? `<ol class="cards cards--kids">${union.children
          .map((child, i) => `<li>${card(child, { num: i + 1 })}</li>`)
          .join('')}</ol>`
      : '';
    return `<div class="union">
      ${spouse ? cards([card(spouse)]) : `<p class="muted">Other parent not recorded</p>`}
      ${meta ? `<p class="union__meta">${esc(meta)}</p>` : ''}
      ${notesList(union.notes)}
      ${kids}
    </div>`;
  });

  const eyebrow = rel.sentence || lifespan(person);

  return `<div class="ex">
    <article class="ex__focus">
      ${eyebrow ? `<p class="tag ex__rel">${esc(eyebrow)}</p>` : ''}
      <h2 class="ex__name" tabindex="-1" data-focus-target>${esc(person.name)}</h2>
      ${person.aka?.length ? `<p class="ex__aka">Also ${person.aka.map(esc).join(' · ')}</p>` : ''}
      ${factList}
      ${notesList(person.notes)}
      ${renderRoute(rel, id)}
      ${lineChips}
      <div class="ex__actions">
        ${parents.length ? `<a class="btn" href="#/ancestors/${id}">Ancestor chart</a>` : ''}
        ${id !== me ? `<button class="btn" type="button" data-me="${id}">This is me</button>` : ''}
      </div>
    </article>
    <div class="ex__family">
      ${group('Parents', parents.length ? cards(parents.map((parent) => card(parent))) : `<p class="muted">Not recorded</p>`)}
      ${families.length ? group(hasSpouse ? 'Spouses and children' : 'Children', familyBlocks.join('')) : ''}
      ${siblings.length ? group('Siblings', cards(siblings.map((s) => card(s.id, { half: s.half })))) : ''}
    </div>
  </div>`;
}

/* ── Ancestors ───────────────────────────────────────────────────────── */

const NODE_W = 188;
const NODE_H = 52;
const GAP_X = 40;
const PITCH = 62;
const CORNER = 6;

function elbow(x1: number, y1: number, x2: number, y2: number) {
  const mid = x1 + GAP_X / 2;
  if (Math.abs(y2 - y1) < CORNER * 2) return `M${x1} ${y1}H${mid}V${y2}H${x2}`;
  const dir = y2 > y1 ? 1 : -1;
  return [
    `M${x1} ${y1}`,
    `H${mid - CORNER}`,
    `Q${mid} ${y1} ${mid} ${y1 + dir * CORNER}`,
    `V${y2 - dir * CORNER}`,
    `Q${mid} ${y2} ${mid + CORNER} ${y2}`,
    `H${x2}`,
  ].join('');
}

function generationLabel(depth: number, rootId: string) {
  if (depth === 0) return rootId === me ? 'You' : firstName(rootId);
  if (depth === 1) return 'Parents';
  return cap(`${greats(depth - 2)}grandparents`);
}

function renderAncestors(rootId: string) {
  const root = get(rootId);
  type Placed = { id: string; depth: number; row: number; parents: { id: string; row: number }[] };
  const placed: Placed[] = [];
  let leaves = 0;
  let deepest = 0;

  /* Leaves take the next free row; everyone else sits midway between their parents. */
  const place = (id: string, depth: number): number => {
    deepest = Math.max(deepest, depth);
    const parents = parentsOf(id).map((parent) => ({ id: parent, row: place(parent, depth + 1) }));
    const row = parents.length ? (parents[0].row + parents[parents.length - 1].row) / 2 : leaves++;
    placed.push({ id, depth, row, parents });
    return row;
  };
  place(rootId, 0);

  const colX = (depth: number) => depth * (NODE_W + GAP_X);
  const rowY = (row: number) => row * PITCH;
  const width = colX(deepest) + NODE_W;
  const height = rowY(leaves - 1) + NODE_H;

  const wires = placed.flatMap((node) =>
    node.parents.map(
      (parent) =>
        `<path d="${elbow(colX(node.depth) + NODE_W, rowY(node.row) + NODE_H / 2, colX(node.depth + 1), rowY(parent.row) + NODE_H / 2)}"/>`,
    ),
  );

  const nodes = placed.map((node) => {
    const person = get(node.id);
    const line = lineByRoot.get(node.id);
    const meta = [lifespan(person), line && `${line.name.split(' / ')[0]} line`].filter(Boolean).join(' · ');
    return `<a class="pnode${node.id === rootId ? ' is-root' : ''}" href="#/explore/${node.id}" title="${esc(person.name)}"
      style="left:${colX(node.depth)}px;top:${rowY(node.row)}px;width:${NODE_W}px;height:${NODE_H}px">
      <span class="pnode__name">${esc(person.name)}</span>
      ${meta ? `<span class="pnode__meta">${esc(meta)}</span>` : ''}
    </a>`;
  });

  const columns = Array.from(
    { length: deepest + 1 },
    (_, depth) => `<span class="anc__col tag" style="left:${colX(depth)}px;width:${NODE_W}px">${esc(generationLabel(depth, rootId))}</span>`,
  );

  const count = placed.length - 1;
  const summary = count
    ? `${count} recorded ancestor${count === 1 ? '' : 's'} across ${deepest} generation${deepest === 1 ? '' : 's'}.${
        rootId === meetingPoint ? ` All ${lines.length} family lines meet here.` : ''
      } Pick anyone to open their record.`
    : `No parents are recorded for ${esc(root.name)}.`;

  return `<div class="anc">
    <div class="anc__head">
      <h2 class="anc__title" tabindex="-1" data-focus-target>Ancestors of ${esc(root.name)}</h2>
      <p class="anc__lede">${summary}${
        me && rootId !== me ? ` <a href="#/ancestors/${me}">Show your own instead</a>.` : ''
      }</p>
    </div>
    <div class="anc__scroll" tabindex="0" role="region" aria-label="Ancestor chart">
      <div class="anc__cols" style="width:${width}px">${columns.join('')}</div>
      <div class="anc__canvas" style="width:${width}px;height:${height}px">
        <svg class="anc__wires" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${wires.join('')}</svg>
        ${nodes.join('')}
      </div>
    </div>
    ${deepest > 2 ? `<p class="tag anc__hint">Scroll sideways for earlier generations</p>` : ''}
  </div>`;
}

/* ── Lines ───────────────────────────────────────────────────────────── */

let lastLine: string | null = null;

function treeNode(id: string, depth: number, startOpen: (id: string, depth: number) => boolean): string {
  const person = get(id);
  const families = familiesOf(id);
  const withKids = families.filter((union) => union.children.length);
  const open = withKids.length > 0 && startOpen(id, depth);

  const spouses = spousesOf(id)
    .map((spouse) => `<a href="#/explore/${spouse}">${esc(get(spouse).name)}</a>`)
    .join(', ');

  const kids = withKids
    .map((union) => {
      const partner = partnerIn(union, id);
      const label =
        withKids.length > 1
          ? `<li class="tree__with tag">${partner ? `with ${esc(get(partner).name)}` : 'other parent not recorded'}</li>`
          : '';
      return label + union.children.map((child) => treeNode(child, depth + 1, startOpen)).join('');
    })
    .join('');

  const classes = ['tree__item', isDirect(id) && 'is-direct', id === me && 'is-me'].filter(Boolean).join(' ');
  const toggle = withKids.length
    ? `<button type="button" class="tree__toggle" aria-expanded="${open}" aria-controls="tree-${id}" data-toggle>
        <span class="vh">Children of ${esc(person.name)}</span>
      </button>`
    : `<span class="tree__dot" aria-hidden="true"></span>`;

  return `<li class="${classes}">
    <div class="tree__row">
      ${toggle}
      <a class="tree__name" href="#/explore/${id}">${esc(person.name)}</a>
      ${lifespan(person) ? `<span class="tree__years">${lifespan(person)}</span>` : ''}
      ${spouses ? `<span class="tree__spouses">m. ${spouses}</span>` : ''}
    </div>
    ${withKids.length ? `<ul class="tree__kids" id="tree-${id}"${open ? '' : ' hidden'}>${kids}</ul>` : ''}
  </li>`;
}

function renderLines(lineId: string | null) {
  const current = lines.find((line) => line.id === lineId) ?? lines[0];
  lastLine = current.id;

  const index = lines
    .map(
      (line) => `<li>
        <a class="lineitem leader" href="#/lines/${line.id}"${line.id === current.id ? ' aria-current="true"' : ''}>
          <span class="lineitem__text">
            <span class="lineitem__name">${esc(line.name)}</span>
            <span class="lineitem__origin">${esc(line.origin)}</span>
          </span>
          <span class="leader__fill" aria-hidden="true"></span>
          <span class="tag lineitem__count">${lineMembers.get(line.id)} people</span>
        </a>
      </li>`,
    )
    .join('');

  /* Big lines start folded so the outline stays readable; the viewer's own branch opens. */
  const mine = me ? ancestry(me) : null;
  const small = (lineMembers.get(current.id) ?? 0) <= 60;
  const startOpen = (id: string, depth: number) => small || depth <= (mine ? 0 : 1) || !!mine?.has(id);
  const root = get(current.root);

  return `<ul class="lines">${index}</ul>
  <section class="outline" aria-labelledby="outline-title">
    <div class="outline__head">
      <h2 class="outline__title" id="outline-title" tabindex="-1" data-focus-target>${esc(current.name)}</h2>
      <p class="outline__lede">${lineDepth.get(current.id)} generations descended from ${esc(root.name)}, with the people they married.${
        mine?.size && descendedFrom[lines.indexOf(current)].has(me!) ? ' Your own branch is highlighted.' : ''
      }</p>
      <div class="outline__tools">
        <button class="btn" type="button" data-expand="all">Expand all</button>
        <button class="btn" type="button" data-expand="none">Collapse all</button>
      </div>
    </div>
    <ul class="tree">${treeNode(current.root, 0, startOpen)}</ul>
  </section>`;
}

/* ── Map ─────────────────────────────────────────────────────────────── */

let mapLine: string | null = null;
let lastPlace: string | null = null;

const KIND_ORDER: PinKind[] = ['born', 'lived', 'married', 'died', 'buried'];
const KIND_LABEL: Record<PinKind, string> = {
  born: 'Born here',
  lived: 'Lived here',
  married: 'Married here',
  died: 'Died here',
  buried: 'Buried here',
};

/** Pins narrowed to the chosen line's people (its descendants and the people they married). */
function mapPins(): Pin[] {
  if (!mapLine) return pins;
  const inLine = (id: string) => !!linesOf.get(id)?.some((line) => line.id === mapLine);
  return pins.flatMap((pin) => {
    const people = pin.people.filter(inLine);
    return people.length ? [{ ...pin, people }] : [];
  });
}

function mapDots(): MapDot[] {
  const counts = new Map<string, Set<string>>();
  for (const pin of mapPins()) {
    const set = counts.get(pin.place) ?? new Set<string>();
    pin.people.forEach((id) => set.add(id));
    counts.set(pin.place, set);
  }
  return [...counts].map(([id, set]) => ({ place: placeById.get(id)!, count: set.size }));
}

const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

function renderMapPanel(placeId: string | null) {
  const lineName = lines.find((line) => line.id === mapLine)?.name;

  if (placeId) {
    const here = mapPins().filter((pin) => pin.place === placeId);
    const groups = KIND_ORDER.map((kind) => {
      const pin = here.find((entry) => entry.kind === kind);
      return pin ? group(KIND_LABEL[kind], cards(pin.people.map((id) => card(id)))) : '';
    }).join('');
    return `<a class="tag map__back" href="#/map">All places</a>
      <h2 class="map__title" tabindex="-1" data-focus-target>${esc(placeById.get(placeId)!.name)}</h2>
      ${groups || `<p class="muted">No one in the ${esc(lineName ?? '')} line is recorded here.</p>`}`;
  }

  const dots = mapDots().sort((a, b) => b.count - a.count || a.place.name.localeCompare(b.place.name));
  return `<h2 class="map__title" tabindex="-1" data-focus-target>${dots.length} places</h2>
    <p class="map__lede">Everywhere the records say someone${
      lineName ? ` in the ${esc(lineName)} line` : ''
    } was born, lived, married, died, or was buried. Pick a dot or a place.</p>
    <ul class="lines map__list">${dots
      .map(
        ({ place, count }) => `<li>
          <a class="lineitem leader" href="#/map/${place.id}">
            <span class="lineitem__text"><span class="lineitem__name">${esc(place.name)}</span></span>
            <span class="leader__fill" aria-hidden="true"></span>
            <span class="tag lineitem__count">${peopleCount(count)}</span>
          </a>
        </li>`,
      )
      .join('')}</ul>`;
}

function renderMap(placeId: string | null) {
  const chip = (id: string | null, label: string) =>
    `<button type="button" class="chip" data-map-line="${id ?? ''}" aria-pressed="${mapLine === id}">${esc(label)}</button>`;
  return `<div class="map">
    <div class="map__filters" role="group" aria-label="Show one line">
      ${chip(null, 'All lines')}${lines.map((line) => chip(line.id, line.name)).join('')}
    </div>
    <div class="map__body">
      <div class="map__canvas" id="fam-map" role="region" aria-label="Map of family places"></div>
      <div class="map__panel" data-map-panel>${renderMapPanel(placeId)}</div>
    </div>
  </div>`;
}

/* ── Search ──────────────────────────────────────────────────────────── */

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/[“”"’'.()]/g, '');

const searchIndex = people.map((person) => ({
  id: person.id,
  name: fold(person.name),
  names: fold([person.name, ...(person.aka ?? [])].join(' | ')),
  places: fold([person.bornPlace, person.diedPlace, person.lived, person.buried].filter(Boolean).join(' | ')),
}));

const startsWord = (haystack: string, word: string) =>
  haystack.startsWith(word) || haystack.includes(` ${word}`) || haystack.includes(`-${word}`);

function search(query: string, withPlaces: boolean) {
  const q = fold(query).trim().replace(/\s+/g, ' ');
  if (!q) return [];
  const words = q.split(' ');
  const hits: { id: string; score: number }[] = [];
  for (const entry of searchIndex) {
    let score: number | null = null;
    if (entry.name.startsWith(q)) score = 0;
    else if (words.every((word) => startsWord(entry.name, word))) score = 1;
    else if (words.every((word) => startsWord(entry.names, word))) score = 2;
    else if (withPlaces && entry.places.includes(q)) score = 3;
    if (score !== null) hits.push({ id: entry.id, score });
  }
  const born = (id: string) => yearOf(get(id).born) ?? 9999;
  return hits
    .sort((a, b) => a.score - b.score || born(a.id) - born(b.id))
    .slice(0, 8)
    .map((hit) => hit.id);
}

function searchContext(id: string) {
  const parents = parentsOf(id);
  if (parents.length) return `child of ${parents.map((parent) => get(parent).name).join(' & ')}`;
  const spouses = spousesOf(id);
  if (spouses.length) return `married ${get(spouses[0]).name}`;
  return '';
}

/** A combobox over everyone in the records; `onChoose` gets the picked id. */
function setupSearch(
  input: HTMLInputElement,
  list: HTMLUListElement,
  options: { prefix: string; withPlaces: boolean; onChoose: (id: string) => void },
) {
  let results: string[] = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const paint = () => {
    if (!input.value.trim()) return close();
    list.innerHTML = results.length
      ? results
          .map((id, i) => {
            const meta = [lifespan(get(id)), searchContext(id)].filter(Boolean).join(' · ');
            return `<li role="option" id="${options.prefix}-${i}" data-id="${id}" aria-selected="${i === active}">
              <span class="fam__result-name">${esc(get(id).name)}</span>
              ${meta ? `<span class="fam__result-meta">${esc(meta)}</span>` : ''}
            </li>`;
          })
          .join('')
      : `<li class="fam__result-none" role="option" aria-disabled="true">No one by that name${options.withPlaces ? ' or place' : ''}</li>`;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${options.prefix}-${active}`);
    else input.removeAttribute('aria-activedescendant');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };

  const choose = (id: string) => {
    input.value = '';
    results = [];
    close();
    options.onChoose(id);
  };

  input.addEventListener('input', () => {
    results = search(input.value, options.withPlaces);
    active = results.length ? 0 : -1;
    paint();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      active = (active + 1) % results.length;
      paint();
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      active = (active - 1 + results.length) % results.length;
      paint();
    } else if (event.key === 'Enter' && results.length) {
      event.preventDefault();
      choose(results[Math.max(active, 0)]);
    } else if (event.key === 'Escape') {
      if (!list.hidden) {
        event.preventDefault();
        close();
      } else {
        input.value = '';
      }
    }
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) paint();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  list.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLElement>('[data-id]');
    if (option) choose(option.dataset.id!);
  });
}

/* ── Routing and mount ───────────────────────────────────────────────── */

const ME_KEY = 'family:viewing-as';

function readMe() {
  try {
    const saved = localStorage.getItem(ME_KEY);
    if (saved && byId.has(saved)) return saved;
  } catch {
    /* Storage blocked; nobody is chosen. */
  }
  return null;
}

function saveMe(id: string | null) {
  try {
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* Storage blocked; the choice lasts for this visit only. */
  }
}

type Route =
  | { view: 'explore'; id: string | null }
  | { view: 'ancestors'; id: string }
  | { view: 'lines'; id: string | null }
  | { view: 'map'; id: string | null };

function parseRoute(): Route {
  const [, view, arg] = location.hash.match(/^#\/(explore|ancestors|lines|map)(?:\/([\w-]+))?/) ?? [];
  const person = arg && byId.has(arg) ? arg : null;
  if (view === 'lines') return { view, id: arg ?? lastLine };
  if (view === 'map') return { view, id: arg && placeById.has(arg) ? arg : null };
  if (view === 'ancestors') return { view, id: person ?? me ?? meetingPoint };
  if (view === 'explore') return { view, id: person };
  return { view: 'explore', id: me };
}

export function mount(root: HTMLElement) {
  const view = root.querySelector<HTMLElement>('#fam-view')!;
  const tabs = [...root.querySelectorAll<HTMLAnchorElement>('[data-tab]')];
  const whoAsk = root.querySelector<HTMLElement>('[data-who-ask]')!;
  const whoSet = root.querySelector<HTMLElement>('[data-who-set]')!;
  const whoName = root.querySelector<HTMLAnchorElement>('[data-who-name]')!;
  const whoInput = root.querySelector<HTMLInputElement>('#fam-who-q')!;
  const searchInput = root.querySelector<HTMLInputElement>('#fam-q')!;
  const baseTitle = document.title;

  me = readMe();
  let lastPerson: string | null = me;
  let mapView: FamilyMap | null = null;
  let mapToken = 0;

  /* The map library (about 280 KB) loads on first use; a route change while it loads cancels the draw. */
  const openMap = async () => {
    const token = ++mapToken;
    const { createMap } = await import('./family-map');
    const el = view.querySelector<HTMLElement>('#fam-map');
    if (token !== mapToken || !el) return;
    mapView = createMap(el, (id) => (location.hash = `#/map/${id}`));
    mapView.show(mapDots(), true);
    mapView.select(parseRoute().id);
  };

  const render = (moveFocus: boolean) => {
    const route = parseRoute();
    if ((route.view === 'explore' || route.view === 'ancestors') && route.id) lastPerson = route.id;
    if (route.view === 'map') lastPlace = route.id;

    /* Arriving at a place the line filter hides (from someone's page, say): show all lines again. */
    const unfilter =
      route.view === 'map' && !!route.id && !!mapLine && !mapPins().some((pin) => pin.place === route.id);
    if (unfilter) mapLine = null;

    if (route.view === 'map' && mapView) {
      /* Same map, new place: keep the map and its zoom, swap the side panel. */
      if (unfilter) {
        for (const chip of view.querySelectorAll<HTMLElement>('[data-map-line]')) {
          chip.setAttribute('aria-pressed', String(!chip.dataset.mapLine));
        }
        mapView.show(mapDots(), false);
      }
      view.querySelector('[data-map-panel]')!.innerHTML = renderMapPanel(route.id);
      mapView.select(route.id);
    } else {
      mapView?.destroy();
      mapView = null;
      mapToken++;
      view.innerHTML =
        route.view === 'explore'
          ? route.id
            ? renderExplore(route.id)
            : renderStart()
          : route.view === 'ancestors'
            ? renderAncestors(route.id)
            : route.view === 'lines'
              ? renderLines(route.id)
              : renderMap(route.id);
      if (route.view === 'map') openMap();
    }

    for (const tab of tabs) {
      const name = tab.dataset.tab;
      tab.href =
        name === 'map'
          ? `#/map${lastPlace ? `/${lastPlace}` : ''}`
          : name === 'lines'
          ? `#/lines${lastLine ? `/${lastLine}` : ''}`
          : name === 'explore'
            ? `#/explore${lastPerson ? `/${lastPerson}` : ''}`
            : `#/ancestors/${lastPerson ?? me ?? meetingPoint}`;
      if (name === route.view) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }

    whoAsk.hidden = !!me;
    whoSet.hidden = !me;
    if (me) {
      whoName.textContent = get(me).name;
      whoName.href = `#/explore/${me}`;
    }

    const heading =
      route.view === 'map'
        ? route.id
          ? placeById.get(route.id)!.name
          : 'Map'
        : route.view === 'lines'
          ? lines.find((line) => line.id === lastLine)?.name
          : route.id
            ? get(route.id).name
            : null;
    document.title = heading ? `${heading} · ${baseTitle}` : baseTitle;

    if (moveFocus) {
      view.querySelector<HTMLElement>('[data-focus-target]')?.focus({ preventScroll: true });
      /* On the map, picking a place shouldn't scroll the map away. */
      if (route.view !== 'map' && view.getBoundingClientRect().top < 0) view.scrollIntoView({ block: 'start' });
    }
  };

  const setMe = (id: string | null) => {
    me = id;
    saveMe(id);
    relationCache.clear();
    const route = parseRoute();
    if (id && route.view === 'explore' && !route.id) {
      location.hash = `#/explore/${id}`;
      return;
    }
    render(false);
  };

  root.addEventListener('click', (event) => {
    const el = (event.target as Element).closest<HTMLElement>(
      '[data-me], [data-who-change], [data-toggle], [data-expand], [data-map-line]',
    );
    if (!el) return;
    if (el.hasAttribute('data-map-line')) {
      mapLine = el.dataset.mapLine || null;
      for (const chip of view.querySelectorAll<HTMLElement>('[data-map-line]')) {
        chip.setAttribute('aria-pressed', String((chip.dataset.mapLine || null) === mapLine));
      }
      view.querySelector('[data-map-panel]')!.innerHTML = renderMapPanel(parseRoute().id);
      mapView?.show(mapDots(), true);
      mapView?.select(parseRoute().id);
    } else if (el.dataset.me) {
      setMe(el.dataset.me);
      view.querySelector<HTMLElement>('[data-focus-target]')?.focus({ preventScroll: true });
    } else if (el.hasAttribute('data-who-change')) {
      setMe(null);
      whoInput.focus();
    } else if (el.hasAttribute('data-toggle')) {
      const open = el.getAttribute('aria-expanded') !== 'true';
      el.setAttribute('aria-expanded', String(open));
      document.getElementById(el.getAttribute('aria-controls')!)!.hidden = !open;
    } else if (el.dataset.expand) {
      const open = el.dataset.expand === 'all';
      for (const toggle of view.querySelectorAll<HTMLElement>('[data-toggle]')) {
        toggle.setAttribute('aria-expanded', String(open));
        document.getElementById(toggle.getAttribute('aria-controls')!)!.hidden = !open;
      }
    }
  });

  window.addEventListener('hashchange', () => {
    /* Leave in-page anchors like the skip link alone. */
    if (location.hash && !location.hash.startsWith('#/')) return;
    render(true);
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target as Element;
    if (event.key === '/' && !target.closest('input, textarea, [contenteditable]')) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  setupSearch(searchInput, root.querySelector<HTMLUListElement>('#fam-q-list')!, {
    prefix: 'fam-opt',
    withPlaces: true,
    onChoose: (id) => (location.hash = `#/explore/${id}`),
  });
  setupSearch(whoInput, root.querySelector<HTMLUListElement>('#fam-who-list')!, {
    prefix: 'fam-who-opt',
    withPlaces: false,
    onChoose: (id) => setMe(id),
  });

  render(false);
}
