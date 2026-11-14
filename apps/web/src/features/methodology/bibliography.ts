/**
 * Literatura cytowana na stronie metodologii. Tylko prace, których dane bibliograficzne są pewne;
 * każda pozycja ma autorów, rok, tytuł oraz czasopismo z tomem i stronami (albo wydawcę).
 * Teksty są nazwami własnymi (nie podlegają tłumaczeniu).
 */
export type Reference =
  | {
      kind: 'article';
      id: string;
      authors: string[];
      year: number;
      title: string;
      journal: string;
      volume: string;
      issue?: string;
      pages: string;
    }
  | {
      kind: 'book';
      id: string;
      authors: string[];
      year: number;
      title: string;
      publisher: string;
      edition?: string;
    }
  | {
      kind: 'dataset';
      id: string;
      authors: string[];
      year: number;
      title: string;
      url: string;
      accessed: string;
    };

export const BIBLIOGRAPHY: Reference[] = [
  {
    kind: 'article',
    id: 'barberis2000',
    authors: ['Barberis, N.'],
    year: 2000,
    title: 'Investing for the long run when returns are predictable',
    journal: 'The Journal of Finance',
    volume: '55',
    issue: '1',
    pages: '225–264',
  },
  {
    kind: 'article',
    id: 'blackman2021',
    authors: ['Blackman, D.', 'Vigna, S.'],
    year: 2021,
    title: 'Scrambled linear pseudorandom number generators',
    journal: 'ACM Transactions on Mathematical Software',
    volume: '47',
    issue: '4',
    pages: '1–32',
  },
  {
    kind: 'article',
    id: 'forbes2002',
    authors: ['Forbes, K. J.', 'Rigobon, R.'],
    year: 2002,
    title: 'No contagion, only interdependence: measuring stock market comovements',
    journal: 'The Journal of Finance',
    volume: '57',
    issue: '5',
    pages: '2223–2261',
  },
  {
    kind: 'article',
    id: 'geweke2001',
    authors: ['Geweke, J.'],
    year: 2001,
    title: 'A note on some limitations of CRRA utility',
    journal: 'Economics Letters',
    volume: '71',
    issue: '3',
    pages: '341–345',
  },
  {
    kind: 'article',
    id: 'guyton2006',
    authors: ['Guyton, J. T.', 'Klinger, W. J.'],
    year: 2006,
    title: 'Decision rules and maximum initial withdrawal rates',
    journal: 'Journal of Financial Planning',
    volume: '19',
    issue: '3',
    pages: '48–58',
  },
  {
    kind: 'article',
    id: 'hamilton1989',
    authors: ['Hamilton, J. D.'],
    year: 1989,
    title:
      'A new approach to the economic analysis of nonstationary time series and the business cycle',
    journal: 'Econometrica',
    volume: '57',
    issue: '2',
    pages: '357–384',
  },
  {
    kind: 'article',
    id: 'hardy2001',
    authors: ['Hardy, M. R.'],
    year: 2001,
    title: 'A regime-switching model of long-term stock returns',
    journal: 'North American Actuarial Journal',
    volume: '5',
    issue: '2',
    pages: '41–53',
  },
  {
    kind: 'article',
    id: 'higham2002',
    authors: ['Higham, N. J.'],
    year: 2002,
    title: 'Computing the nearest correlation matrix: a problem from finance',
    journal: 'IMA Journal of Numerical Analysis',
    volume: '22',
    issue: '3',
    pages: '329–343',
  },
  {
    kind: 'article',
    id: 'hyndman1996',
    authors: ['Hyndman, R. J.', 'Fan, Y.'],
    year: 1996,
    title: 'Sample quantiles in statistical packages',
    journal: 'The American Statistician',
    volume: '50',
    issue: '4',
    pages: '361–365',
  },
  {
    kind: 'article',
    id: 'jorda2019',
    authors: ['Jordà, Ò.', 'Knoll, K.', 'Kuvshinov, D.', 'Schularick, M.', 'Taylor, A. M.'],
    year: 2019,
    title: 'The rate of return on everything, 1870–2015',
    journal: 'The Quarterly Journal of Economics',
    volume: '134',
    issue: '3',
    pages: '1225–1298',
  },
  {
    kind: 'article',
    id: 'ledoit2004',
    authors: ['Ledoit, O.', 'Wolf, M.'],
    year: 2004,
    title: 'A well-conditioned estimator for large-dimensional covariance matrices',
    journal: 'Journal of Multivariate Analysis',
    volume: '88',
    issue: '2',
    pages: '365–411',
  },
  {
    kind: 'book',
    id: 'mcneil2015',
    authors: ['McNeil, A. J.', 'Frey, R.', 'Embrechts, P.'],
    year: 2015,
    title: 'Quantitative Risk Management: Concepts, Techniques and Tools',
    publisher: 'Princeton University Press',
    edition: 'wyd. poprawione',
  },
  {
    kind: 'article',
    id: 'merton1980',
    authors: ['Merton, R. C.'],
    year: 1980,
    title: 'On estimating the expected return on the market: an exploratory investigation',
    journal: 'Journal of Financial Economics',
    volume: '8',
    issue: '4',
    pages: '323–361',
  },
  {
    kind: 'article',
    id: 'pastor2012',
    authors: ['Pástor, Ľ.', 'Stambaugh, R. F.'],
    year: 2012,
    title: 'Are stocks really less volatile in the long run?',
    journal: 'The Journal of Finance',
    volume: '67',
    issue: '2',
    pages: '431–478',
  },
  {
    kind: 'article',
    id: 'politis1994',
    authors: ['Politis, D. N.', 'Romano, J. P.'],
    year: 1994,
    title: 'The stationary bootstrap',
    journal: 'Journal of the American Statistical Association',
    volume: '89',
    issue: '428',
    pages: '1303–1313',
  },
  {
    kind: 'article',
    id: 'rogoff1996',
    authors: ['Rogoff, K.'],
    year: 1996,
    title: 'The purchasing power parity puzzle',
    journal: 'Journal of Economic Literature',
    volume: '34',
    issue: '2',
    pages: '647–668',
  },
  {
    kind: 'article',
    id: 'taylor2004',
    authors: ['Taylor, A. M.', 'Taylor, M. P.'],
    year: 2004,
    title: 'The purchasing power parity debate',
    journal: 'Journal of Economic Perspectives',
    volume: '18',
    issue: '4',
    pages: '135–158',
  },
  {
    kind: 'article',
    id: 'waring2015',
    authors: ['Waring, M. B.', 'Siegel, L. B.'],
    year: 2015,
    title: 'The only spending rule article you will ever need',
    journal: 'Financial Analysts Journal',
    volume: '71',
    issue: '1',
    pages: '91–99',
  },
  {
    kind: 'article',
    id: 'wichura1988',
    authors: ['Wichura, M. J.'],
    year: 1988,
    title: 'Algorithm AS 241: the percentage points of the normal distribution',
    journal: 'Journal of the Royal Statistical Society, Series C (Applied Statistics)',
    volume: '37',
    issue: '3',
    pages: '477–484',
  },
  {
    kind: 'article',
    id: 'wilson1927',
    authors: ['Wilson, E. B.'],
    year: 1927,
    title: 'Probable inference, the law of succession, and statistical inference',
    journal: 'Journal of the American Statistical Association',
    volume: '22',
    issue: '158',
    pages: '209–212',
  },
  {
    kind: 'dataset',
    id: 'shiller',
    authors: ['Shiller, R. J.'],
    year: 2024,
    title: 'Online data: U.S. stock markets 1871–present and CAPE ratio (ie_data.xls)',
    url: 'https://shillerdata.com',
    accessed: '2026-11-14',
  },
];

export function referenceById(id: string): Reference | undefined {
  return BIBLIOGRAPHY.find((b) => b.id === id);
}

/** Skrót do cytowania w tekście: „Higham 2002”, „Politis i Romano 1994”, „Jordà i in. 2019”. */
export function citeLabel(b: Reference): string {
  const surname = (a: string) => a.split(',')[0] ?? a;
  const names = b.authors.map(surname);
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} i ${names[1]}`
        : `${names[0]} i in.`;
  return `${who} ${b.year}`;
}
