import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { i18n } from '../../i18n';
import { BIBLIOGRAPHY } from './bibliography';
import { FORMULA_IDS } from './formulas';
import { Methodology } from './Methodology';

function page() {
  return render(
    <I18nProvider i18n={i18n}>
      <Methodology />
    </I18nProvider>,
  );
}

/** Sekcje odpowiadające spec 4.1–4.14 (numer sekcji specu → fragment nagłówka). */
const SPEC_SECTIONS: Array<[string, RegExp]> = [
  ['4.1', /krok czasowy/i],
  ['4.2', /liczby losowe/i],
  ['4.3', /grube ogony/i],
  ['4.4', /reżimy rynku/i],
  ['4.5', /niepewność parametrów/i],
  ['4.6', /inflacja/i],
  ['4.7', /waluty/i],
  ['4.8', /typy aktywów/i],
  ['4.9', /portfel, rebalans/i],
  ['4.10', /podatki/i],
  ['4.11', /wpłaty i wypłaty/i],
  ['4.12', /śmiertelność/i],
  ['4.13', /statystyki/i],
  ['4.14', /wydajność/i],
];

describe('strona metodologii: treść', () => {
  it('ma nagłówek h1 i po jednej sekcji dla każdego punktu spec 4.1–4.14', () => {
    const { container } = page();
    expect(screen.getByRole('heading', { level: 1, name: 'Metodologia' })).toBeInTheDocument();
    for (const [num, title] of SPEC_SECTIONS) {
      const section = container.querySelector(`section[data-spec="${num}"]`);
      expect(section, `brak sekcji ${num}`).not.toBeNull();
      const h = within(section as HTMLElement).getByRole('heading', { level: 2 });
      expect(h.textContent, `nagłówek sekcji ${num}`).toMatch(title);
      // proste słowa: sekcja ma co najmniej dwa akapity tekstu
      expect(
        (section as HTMLElement).querySelectorAll('p').length,
        `akapity w ${num}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('mówi prostym językiem: wzory są tylko w aneksie', () => {
    const { container } = page();
    const annex = container.querySelector('#aneks');
    expect(annex).not.toBeNull();
    for (const section of container.querySelectorAll('section[data-spec]')) {
      expect(section.querySelector('.katex'), 'wzór poza aneksem').toBeNull();
      expect(section.textContent).not.toMatch(/\\frac|\\sigma|\\mu|\$\$/);
    }
    expect(screen.getByRole('heading', { level: 2, name: /Aneks: wzory/ })).toBeInTheDocument();
  });

  it('ma sekcję „Uproszczenia i ograniczenia” z uczciwym opisem kluczowych uproszczeń', () => {
    const { container } = page();
    const section = container.querySelector('section[data-section="limitations"]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(
      within(section).getByRole('heading', { level: 2, name: 'Uproszczenia i ograniczenia' }),
    ).toBeInTheDocument();
    const text = section.textContent ?? '';
    // R-3: reguła strat to heurystyka zachłanna
    expect(text).toMatch(/heurystyk\w* zachłann/);
    expect(text).toMatch(/art\. 9 ust\. 3/);
    // podatek od niezrealizowanych zysków z krypto (latent)
    expect(text).toMatch(/niezrealizowan/);
    expect(text).toMatch(/krypto/i);
    // przepisy z pamięci, niezweryfikowane w ISAP
    expect(text).toMatch(/ISAP/);
    expect(text).toMatch(/z pamięci/);
    expect(text).toMatch(/niezweryfikowan/);
    // backtest T9
    expect(text).toMatch(/T9/);
    expect(text).toMatch(/niepewno\S+ parametrów/);
    expect(text).toMatch(/3%/);
    expect(text).toMatch(/7%/);
    // IKE/IKZE i nieruchomość
    expect(text).toMatch(/IKE/);
    expect(text).toMatch(/IKZE/);
    expect(text).toMatch(/nieruchomo/i);
    // reklama i porada: model nie jest prognozą
    expect(text).toMatch(/nie jest prognoz/);
  });

  it('ma sekcję o weryfikacji (testy, backtest) i o źródłach danych', () => {
    const { container } = page();
    expect(container.querySelector('section[data-section="verification"]')).not.toBeNull();
    expect(container.querySelector('section[data-section="data"]')).not.toBeNull();
  });
});

describe('strona metodologii: aneks ze wzorami (KaTeX)', () => {
  it('renderuje wszystkie wzory po leniwym załadowaniu KaTeX', async () => {
    const { container } = page();
    const items = container.querySelectorAll('#aneks [data-formula]');
    expect(items.length).toBe(FORMULA_IDS.length);
    expect(items.length).toBeGreaterThanOrEqual(25);
    await waitFor(
      () => {
        expect(container.querySelectorAll('#aneks .katex').length).toBe(FORMULA_IDS.length);
      },
      { timeout: 15_000 },
    );
    // kluczowe wzory są w aneksie (źródło TeX w adnotacji MathML)
    const tex = [...container.querySelectorAll('#aneks annotation[encoding="application/x-tex"]')]
      .map((a) => a.textContent)
      .join('\n');
    expect(tex).toContain('\\omega_i');
    expect(tex).toContain('\\operatorname{PMT}');
    expect(tex).toContain('\\tilde{R}');
  });

  it('przed załadowaniem KaTeX pokazuje czytelny tekst zastępczy z TeX-em', () => {
    const { container } = page();
    const first = container.querySelector('#aneks [data-formula]') as HTMLElement;
    expect(first.textContent).toMatch(/\\/);
  });
});

describe('literatura', () => {
  it('każda pozycja ma pełne dane bibliograficzne', () => {
    expect(BIBLIOGRAPHY.length).toBeGreaterThanOrEqual(15);
    const ids = new Set<string>();
    for (const b of BIBLIOGRAPHY) {
      expect(ids.has(b.id), `duplikat ${b.id}`).toBe(false);
      ids.add(b.id);
      expect(b.authors.length, `${b.id}: autorzy`).toBeGreaterThan(0);
      for (const a of b.authors) expect(a.trim().length).toBeGreaterThan(2);
      expect(b.year, `${b.id}: rok`).toBeGreaterThan(1900);
      expect(b.year).toBeLessThanOrEqual(2026);
      expect(b.title.trim().length, `${b.id}: tytuł`).toBeGreaterThan(10);
      if (b.kind === 'article') {
        expect(b.journal.length, `${b.id}: czasopismo`).toBeGreaterThan(3);
        expect(b.volume, `${b.id}: tom`).toMatch(/^\d+$/);
        expect(b.pages, `${b.id}: strony`).toMatch(/^[\dA-Za-z]+[–-][\dA-Za-z]+$|^\d+$/);
      } else if (b.kind === 'book') {
        expect(b.publisher.length, `${b.id}: wydawca`).toBeGreaterThan(3);
      } else {
        expect(b.kind).toBe('dataset');
        expect(b.url).toMatch(/^https:\/\//);
        expect(b.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('zawiera prace wskazane w spec (Higham 2002, Politis i Romano 1994, Guyton i Klinger 2006, Hamilton 1989)', () => {
    const has = (id: string, year: number, author: string) => {
      const b = BIBLIOGRAPHY.find((x) => x.id === id);
      expect(b, id).toBeDefined();
      expect(b!.year).toBe(year);
      expect(b!.authors.join(' ')).toContain(author);
    };
    has('higham2002', 2002, 'Higham');
    has('politis1994', 1994, 'Politis');
    has('guyton2006', 2006, 'Klinger');
    has('hamilton1989', 1989, 'Hamilton');
    has('hardy2001', 2001, 'Hardy');
    has('wichura1988', 1988, 'Wichura');
    has('blackman2021', 2021, 'Vigna');
  });

  it('wszystkie cytowania w tekście wskazują pozycję z literatury i każda pozycja jest cytowana', () => {
    const { container } = page();
    const known = new Set(BIBLIOGRAPHY.map((b) => b.id));
    const cited = new Set<string>();
    for (const el of container.querySelectorAll('a[data-cite]')) {
      const id = el.getAttribute('data-cite')!;
      expect(known.has(id), `cytowanie nieznanej pozycji ${id}`).toBe(true);
      expect(el.getAttribute('href')).toBe(`#lit-${id}`);
      expect(container.querySelector(`#lit-${id}`), `brak wpisu #lit-${id}`).not.toBeNull();
      cited.add(id);
    }
    const missing = [...known].filter((id) => !cited.has(id));
    expect(missing, 'pozycje bez cytowania w tekście').toEqual([]);
  });

  it('lista literatury jest listą z wpisami o pełnym opisie (autor, rok, tytuł, czasopismo, strony)', () => {
    const { container } = page();
    const higham = container.querySelector('#lit-higham2002') as HTMLElement;
    expect(higham.textContent).toContain('Higham');
    expect(higham.textContent).toContain('2002');
    expect(higham.textContent).toContain('Computing the nearest correlation matrix');
    expect(higham.textContent).toContain('IMA Journal of Numerical Analysis');
    expect(higham.textContent).toContain('329');
    expect(higham.textContent).toContain('343');
  });
});

describe('trasa i nawigacja', () => {
  it('trasa /metodologia pokazuje stronę, a stopka ma do niej link', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/metodologia'] });
    render(
      <I18nProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nProvider>,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Metodologia' }),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Metodologia' });
    expect(link).toHaveAttribute('href', '/metodologia');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.closest('footer')).not.toBeNull();
  });
});

describe('docs/METHODOLOGY.md', () => {
  const md = readFileSync(resolve(process.cwd(), '../../docs/METHODOLOGY.md'), 'utf8');
  it('opisuje wszystkie sekcje 4.1–4.14 i uproszczenia', () => {
    for (const [num] of SPEC_SECTIONS) expect(md, num).toContain(`(spec ${num})`);
    expect(md).toContain('## Uproszczenia i ograniczenia');
    expect(md).toContain('## Aneks: wzory');
    expect(md).toContain('## Literatura');
  });
  it('zawiera każdą pozycję literatury ze strony (autor i rok)', () => {
    for (const b of BIBLIOGRAPHY) {
      expect(md, b.id).toContain(b.title);
    }
  });
});

describe('KaTeX nie trafia do głównego chunku (manifest builda)', () => {
  it('build produkcyjny: katex tylko w chunku ładowanym dynamicznie', async () => {
    const { build } = await import('vite');
    const outDir = mkdtempSync(join(tmpdir(), 'sim-web-build-'));
    try {
      await build({
        configFile: resolve(process.cwd(), 'vite.config.ts'),
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true, manifest: true, reportCompressedSize: false },
      });
      const manifestPath = join(outDir, '.vite', 'manifest.json');
      expect(existsSync(manifestPath), 'manifest.json').toBe(true);
      type Entry = {
        file: string;
        isEntry?: boolean;
        imports?: string[];
        dynamicImports?: string[];
        src?: string;
      };
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, Entry>;
      const entry = Object.values(manifest).find((e) => e.isEntry);
      expect(entry, 'wpis główny').toBeDefined();

      // domknięcie statycznych importów głównego wpisu
      const staticSet = new Set<string>();
      const visit = (key: string) => {
        if (staticSet.has(key)) return;
        staticSet.add(key);
        for (const i of manifest[key]?.imports ?? []) visit(i);
      };
      const entryKey = Object.keys(manifest).find((k) => manifest[k] === entry)!;
      visit(entryKey);

      for (const key of staticSet) {
        const file = manifest[key]!.file;
        if (!file.endsWith('.js')) continue;
        const code = readFileSync(join(outDir, file), 'utf8');
        expect(code, `katex w statycznym chunku ${file}`).not.toMatch(
          /KaTeX parse error|katex-html|\\\\KaTeX/,
        );
      }

      // gdzieś jest chunk z KaTeX i jest osiągalny tylko dynamicznie
      const katexChunks = readdirSync(join(outDir, 'assets'))
        .filter((f) => f.endsWith('.js'))
        .filter((f) => /KaTeX parse error/.test(readFileSync(join(outDir, 'assets', f), 'utf8')));
      expect(katexChunks.length, 'chunk z KaTeX').toBeGreaterThan(0);
      for (const f of katexChunks) {
        const key = Object.keys(manifest).find((k) => manifest[k]!.file === `assets/${f}`);
        expect(key, `wpis manifestu dla ${f}`).toBeDefined();
        expect(
          staticSet.has(key!),
          `${f} nie może być w statycznym domknięciu głównego wpisu`,
        ).toBe(false);
      }
      expect(statSync(join(outDir, 'assets')).isDirectory()).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 240_000);
});
