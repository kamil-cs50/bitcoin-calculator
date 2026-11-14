import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseGusLifeTableXlsx } from './lifeTable';

/** Minimalny XLSX z dwoma arkuszami ogółem; q_x(a) = base + a/1000, e_x(a) = 80 − a/2 (kolumny jak w GUS). */
function fakeXlsx(opts: { dropAge?: number } = {}): Uint8Array {
  const sheet = (base: number): string => {
    let rows = `<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="5"><c r="A5" t="s"><v>1</v></c><c r="B5" t="s"><v>2</v></c></row>`;
    for (let a = 0; a <= 100; a++) {
      if (a === opts.dropAge) continue;
      const r = 7 + a;
      rows += `<row r="${r}"><c r="A${r}"><v>${a}</v></c><c r="B${r}"><v>${base + a / 1000}</v></c><c r="G${r}"><v>${80 - a / 2}</v></c></row>`;
    }
    return `<worksheet><sheetData>${rows}</sheetData></worksheet>`;
  };
  return zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="x"><sheets><sheet name="Miasta M" sheetId="3" r:id="rId3"/>' +
        '<sheet name="Ogółem kobiety" sheetId="2" r:id="rId2"/><sheet name="Ogółem mężczyźni" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="t" Target="/xl/worksheets/sheet3.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet(0.002)),
    'xl/worksheets/sheet2.xml': strToU8(sheet(0.001)),
    'xl/worksheets/sheet3.xml': strToU8(sheet(0.5)),
  });
}

describe('parseGusLifeTableXlsx', () => {
  it('czyta q_x wieku 0-100 z arkuszy „Ogółem”, pomijając komórki tekstowe i inne arkusze', () => {
    const t = parseGusLifeTableXlsx(fakeXlsx());
    expect(t.male.qx).toHaveLength(101);
    expect(t.male.qx[0]).toBeCloseTo(0.002, 12);
    expect(t.female.qx[100]).toBeCloseTo(0.101, 12);
    expect(t.male.e60).toBe(50);
    expect(t.female.e0).toBe(80);
    expect(t.female.e65).toBe(47.5);
  });
  it('zgłasza brakujący wiek i niepoprawny plik', () => {
    expect(() => parseGusLifeTableXlsx(fakeXlsx({ dropAge: 42 }))).toThrow(/brak q_x dla wieku 42/);
    expect(() => parseGusLifeTableXlsx(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/XLSX/);
  });
});
