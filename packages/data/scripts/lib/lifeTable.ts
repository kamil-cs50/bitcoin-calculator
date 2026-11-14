import { unzipSync, strFromU8 } from 'fflate';

// Parser pliku GUS „Tablica A” (trwanie życia, XLSX): arkusze „Ogółem mężczyźni” i „Ogółem kobiety”,
// kolumny: A wiek x, B q_x, C l_x, D d_x, E L_x, F T_x, G e_x. Bez zależności od Excela: XLSX to ZIP z XML.

export interface LifeTableSheet {
  /** q_x dla wieku 0..100. */
  qx: number[];
  /** Opublikowane przeciętne dalsze trwanie życia e_x (kolumna G) dla wieku 0, 60 i 65. */
  e0: number;
  e60: number;
  e65: number;
}
export interface GusLifeTables {
  male: LifeTableSheet;
  female: LifeTableSheet;
}

const MAX_AGE = 100;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Zwraca `[nazwa arkusza, ścieżka pliku XML]` z workbook.xml i jego relacji. */
function sheetPaths(files: Record<string, Uint8Array>): [string, string][] {
  const wb = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (!wb || !rels) throw new Error('To nie jest poprawny plik XLSX (brak workbook.xml)');
  const relTarget = new Map<string, string>();
  for (const m of strFromU8(rels).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(m[0])?.[1];
    if (id && target) relTarget.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const out: [string, string][] = [];
  for (const m of strFromU8(wb).matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const rid = /\br:id="([^"]*)"/.exec(m[0])?.[1];
    const path = rid ? relTarget.get(rid) : undefined;
    if (name && path) out.push([decode(name), path]);
  }
  return out;
}

/** Wartości liczbowe komórek arkusza: mapa `A7` → liczba (komórki tekstowe i puste pomijane). */
function numericCells(xml: string): Map<string, number> {
  const cells = new Map<string, number>();
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
    const attrs = m[1] ?? '';
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
    const v = /<v>([^<]*)<\/v>/.exec(m[2] ?? '')?.[1];
    if (!ref || v === undefined || (type !== undefined && type !== 'n')) continue;
    const num = Number(v);
    if (Number.isFinite(num)) cells.set(ref, num);
  }
  return cells;
}

function parseSheet(xml: string, label: string): LifeTableSheet {
  const cells = numericCells(xml);
  const qx: (number | undefined)[] = [];
  const ex = new Map<number, number>();
  for (let row = 1; row <= 400; row++) {
    const age = cells.get(`A${row}`);
    if (age === undefined || !Number.isInteger(age) || age < 0 || age > MAX_AGE) continue;
    const q = cells.get(`B${row}`);
    if (q === undefined) continue;
    if (qx[age] !== undefined) throw new Error(`${label}: powtórzony wiek ${age}`);
    qx[age] = q;
    const e = cells.get(`G${row}`);
    if (e !== undefined) ex.set(age, e);
  }
  for (let a = 0; a <= MAX_AGE; a++) {
    const q = qx[a];
    if (q === undefined) throw new Error(`${label}: brak q_x dla wieku ${a}`);
    if (!(q > 0 && q <= 1)) throw new Error(`${label}: q_${a} = ${q} poza (0, 1]`);
  }
  const pick = (a: number): number => {
    const e = ex.get(a);
    if (e === undefined) throw new Error(`${label}: brak e_${a}`);
    return e;
  };
  return { qx: qx as number[], e0: pick(0), e60: pick(60), e65: pick(65) };
}

/** Parsuje XLSX „Tablica A” (bajty pliku) do q_x dla mężczyzn i kobiet ogółem, wiek 0–100. */
export function parseGusLifeTableXlsx(bytes: Uint8Array): GusLifeTables {
  const files = unzipSync(bytes);
  const sheets = sheetPaths(files);
  const find = (needle: RegExp): string => {
    const hit = sheets.find(([name]) => needle.test(name.toLowerCase()));
    if (!hit) throw new Error(`Brak arkusza ${String(needle)} (są: ${sheets.map(([n]) => n).join(', ')})`);
    const data = files[hit[1]];
    if (!data) throw new Error(`Brak pliku ${hit[1]} w XLSX`);
    return strFromU8(data);
  };
  return {
    male: parseSheet(find(/ogółem.*mężczyźni/), 'Ogółem mężczyźni'),
    female: parseSheet(find(/ogółem.*kobiety/), 'Ogółem kobiety'),
  };
}
