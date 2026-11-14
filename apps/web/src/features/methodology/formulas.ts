/** Wzory z aneksu (TeX). Opisy słowne są w komponencie Annex (przez Lingui); tu tylko zapis matematyczny. */
import { numberLocale } from '../../i18n';
export const FORMULAS = {
  drift: String.raw`\mu = \frac{\ln(1+g)}{12}, \qquad V \leftarrow V\,e^{r}\,(1-\mathrm{TER})^{1/12}`,
  seed: String.raw`\mathrm{seed}_{p,k} = \operatorname{fmix32}\!\bigl(\operatorname{fmix32}(\mathrm{seed}\oplus 0\mathrm{x}9\mathrm{E}3779\mathrm{B}9\,(p+1))\oplus 0\mathrm{x}85\mathrm{EBCA}6\mathrm{B}\,(k+1)\bigr)`,
  uniform: String.raw`u = \frac{x + 0{,}5}{2^{32}} \in (0,1)`,
  scale: String.raw`s_k = \sqrt{\frac{\nu-2}{Q_{\chi^2_\nu}(u_k)}},\quad u_k = \frac{k+\tfrac12}{K},\quad \frac1K\sum_{k=1}^{K} s_k^2 = 1`,
  shock: String.raw`\varepsilon_t = s_t\, L\, z_t,\qquad z_t \sim N(0, I),\qquad \operatorname{Cov}(\varepsilon_t) = \tilde{R}`,
  arithmeticMean: String.raw`E\!\left[e^{r}\right] = e^{\mu}\cdot\frac1K\sum_{k=1}^{K}\exp\!\Bigl(\tfrac{\sigma_m^2 s_k^2}{2}\Bigr)`,
  arithmeticMeanRegime: String.raw`E\!\left[e^{r}\right] = e^{\mu}\sum_{s}\pi_s\, e^{\alpha\sigma\delta_s}\;\frac1K\sum_{k=1}^{K}\exp\!\Bigl(\tfrac{\sigma_m^2\kappa_s^2 s_k^2}{2}\Bigr)`,
  chain: String.raw`\pi_1 = \frac{p_{01}}{p_{01}+p_{10}},\quad \pi_0 = 1-\pi_1,\quad \lambda = 1-p_{01}-p_{10}`,
  regimeReturn: String.raw`r_{i,t} = \mu_i(t) + \alpha_i\,\sigma_i(t)\,\delta_{s_t} + \sigma_{m,i}(t)\,\kappa_{s_t,i}\,\varepsilon_{i,t}`,
  delta: String.raw`\delta_0 = \pi_1\Delta,\quad \delta_1 = -\pi_0\Delta,\quad V_\delta = \pi_0\pi_1\Delta^2`,
  kappa: String.raw`\kappa_{s,i} = 1 + b_i(\kappa_s - 1),\qquad K_{ij} = \pi_0\kappa_{0,i}\kappa_{0,j} + \pi_1\kappa_{1,i}\kappa_{1,j}`,
  omega: String.raw`A = 12 + 2\sum_{k=1}^{11}(12-k)\lambda^{k},\qquad \omega_i = \alpha_i^{2}\,V_\delta\,A \;\le\; 0{,}8`,
  sigmaM: String.raw`\sigma_{m,i} = \sigma_i\sqrt{\frac{1-\omega_i}{12\,K_{ii}}}`,
  rTilde: String.raw`\tilde{R}_{ij} = \frac{\rho_{ij} - \alpha_i\alpha_j V_\delta A}{\sqrt{(1-\omega_i)(1-\omega_j)}\;\dfrac{K_{ij}}{\sqrt{K_{ii}K_{jj}}}}`,
  uncertainty: String.raw`\Delta\mu^{(p)} = D\,L_\rho\,z,\quad D = \operatorname{diag}(\mathrm{SE}_i),\qquad \operatorname{mediana}(W_T) = W_0(1+g)^T,\quad \frac{E[W_T]}{W_0(1+g)^T} \approx e^{\mathrm{SE}^2 T^2/2}`,
  inflation: String.raw`x_{t+1} = \bar\imath^{(p)} + \varphi\,(x_t - \bar\imath^{(p)}) + \sigma_\eta\,\varepsilon^{\pi}_{t+1},\qquad \ln \mathrm{CPI}_{t+1} = \ln \mathrm{CPI}_t + \frac{x_{t+1}}{12}`,
  inflationYoY: String.raw`\mathrm{yy}_t = \frac{\mathrm{CPI}_t}{\mathrm{CPI}_{t-12}} - 1,\qquad \bar\imath^{(p)} = \bar\imath + \mathrm{SE}_{\bar\imath}\, z`,
  inflationCalib: String.raw`G(\varphi) = 12 + 2\sum_{k=1}^{11}(12-k)\varphi^{k},\quad \operatorname{Var}\bigl(\ln(1+\mathrm{yy})\bigr) = \frac{V_x}{144}\,G(\varphi),\quad V_x = \frac{\sigma_\eta^2}{1-\varphi^2}`,
  rho12: String.raw`\rho_{12}(\varphi) = \frac{\varphi\,(1-\varphi^{12})^{2}}{(1-\varphi)^{2}\,G(\varphi)}`,
  fxReal: String.raw`q_{t+1} = \varphi_q\,q_t + \alpha_q\sigma_q\delta_{s_t} + \sigma_{q,m}\,\kappa\,\varepsilon^{fx},\qquad \varphi_q = 2^{-1/(12H)}`,
  fxNominal: String.raw`\ln S_t = \ln S_0 + q_t + \bigl(\ln \mathrm{CPI}^{PL}_t - \ln \mathrm{CPI}^{PL}_0\bigr) - \pi^{F}\,\frac{t}{12}`,
  fxVar: String.raw`\operatorname{Var}(q_{t+12}-q_t) = 2V_q\,(1-\varphi_q^{12}) + \omega_q\,\sigma_q^{2},\qquad V_q = \frac{\sigma_{q,m}^2\,K_q}{1-\varphi_q^{2}}`,
  effectiveVol: String.raw`\sigma_{\mathrm{PLN}} = \sqrt{\sigma_a^2 + \sigma_{fx}^2 + 2\rho\,\sigma_a\sigma_{fx}}`,
  deposit: String.raw`d_{t+1} = \max\bigl(0,\; d_t + k\,(x_t + s - d_t)\bigr)`,
  cryptoDecay: String.raw`g(t) = g_\infty + (g_0 - g_\infty)\,e^{-t/\tau_g},\qquad \sigma(t) = \sigma_\infty + (\sigma_0 - \sigma_\infty)\,e^{-t/\tau_\sigma}`,
  collapse: String.raw`V \leftarrow V\,(1-L),\qquad P(\text{upadek do roku } T) = 1 - e^{-hT}`,
  taxSecurities: String.raw`\text{podatek} = 0{,}19\cdot\max\bigl(0,\; P - K - O\bigr)`,
  taxCrypto: String.raw`\text{dochód}_{\text{rok}} = P_{\text{rok}} - \bigl(W_{\text{rok}} + C_{\text{z lat poprzednich}}\bigr)`,
  accounting: String.raw`W_{\mathrm{end}} = W_{\mathrm{start}} + Z_{\mathrm{rynek}} + F_{\mathrm{wpłaty}} - F_{\mathrm{wypłaty}} - T_{\mathrm{podatki}} - O_{\mathrm{opłaty}} - K_{\mathrm{koszty}}`,
  real: String.raw`W^{\mathrm{real}}_t = \frac{W^{\mathrm{nom}}_t}{\mathrm{CPI}_t}`,
  pmt: String.raw`\operatorname{PMT}(r,n,W,1) = \frac{r\,W}{(1+r)\,\bigl(1-(1+r)^{-n}\bigr)}`,
  quantile: String.raw`Q(p) = x_{(\lfloor h\rfloor)} + (h-\lfloor h\rfloor)\bigl(x_{(\lfloor h\rfloor+1)} - x_{(\lfloor h\rfloor)}\bigr),\qquad h = (n-1)p+1`,
  wilson: String.raw`\frac{\hat p + \dfrac{z^2}{2n} \pm z\sqrt{\dfrac{\hat p(1-\hat p)}{n} + \dfrac{z^2}{4n^2}}}{1 + \dfrac{z^2}{n}}`,
  quantileCI: String.raw`\bigl[\,x_{(\lfloor np - z\sqrt{np(1-p)}\rfloor)},\; x_{(\lceil np + z\sqrt{np(1-p)}\rceil)}\,\bigr]`,
  cvar: String.raw`\mathrm{CVaR}_{5\%} = \frac{1}{\lceil 0{,}05\,n\rceil}\sum_{j=1}^{\lceil 0{,}05\,n\rceil} x_{(j)}`,
  twr: String.raw`\mathrm{CAGR}_{\mathrm{real}} = \exp\!\Bigl(\frac{12}{T}\bigl(\ln I_T - \ln \mathrm{CPI}_T\bigr)\Bigr) - 1`,
  ruinAlive: String.raw`P = \sum_{t} \hat P(\text{ruina w miesiącu } t)\,S(t)`,
  bootstrap: String.raw`P(\text{nowy blok}) = \frac1L,\qquad E[\text{długość bloku}] = L`,
} as const;

export type FormulaId = keyof typeof FORMULAS;
export const FORMULA_IDS = Object.keys(FORMULAS) as FormulaId[];

/** Słowne człony wzorów po angielsku (reszta to symbole); pozostałe wzory różnią się tylko separatorem dziesiętnym. */
const FORMULAS_EN: Partial<Record<FormulaId, string>> = {
  uncertainty: String.raw`\Delta\mu^{(p)} = D\,L_\rho\,z,\quad D = \operatorname{diag}(\mathrm{SE}_i),\qquad \operatorname{median}(W_T) = W_0(1+g)^T,\quad \frac{E[W_T]}{W_0(1+g)^T} \approx e^{\mathrm{SE}^2 T^2/2}`,
  collapse: String.raw`V \leftarrow V\,(1-L),\qquad P(\text{collapse by year } T) = 1 - e^{-hT}`,
  taxSecurities: String.raw`\text{tax} = 0.19\cdot\max\bigl(0,\; P - K - O\bigr)`,
  taxCrypto: String.raw`\text{income}_{\text{year}} = P_{\text{year}} - \bigl(W_{\text{year}} + C_{\text{previous years}}\bigr)`,
  accounting: String.raw`W_{\mathrm{end}} = W_{\mathrm{start}} + G_{\mathrm{market}} - F_{\mathrm{out}} + F_{\mathrm{in}} - T_{\mathrm{taxes}} - O_{\mathrm{fees}} - K_{\mathrm{costs}}`,
  ruinAlive: String.raw`P = \sum_{t} \hat P(\text{ruin in month } t)\,S(t)`,
  bootstrap: String.raw`P(\text{new block}) = \frac1L,\qquad E[\text{block length}] = L`,
};

/** Zapis TeX wzoru w bieżącym języku (polski przecinek dziesiętny `{,}` po angielsku to kropka). */
export function formulaTex(id: FormulaId): string {
  if (numberLocale() !== 'en-GB') return FORMULAS[id];
  return (FORMULAS_EN[id] ?? FORMULAS[id]).replaceAll('{,}', '.');
}
