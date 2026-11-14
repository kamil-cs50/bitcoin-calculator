import { useLingui } from '@lingui/react/macro';

export type TileKind = 'btc' | 'world' | 'sp500' | 'edo' | 'deposit' | 'gold' | 'home' | 'custom';

export const TILE_ORDER: readonly TileKind[] = ['btc', 'world', 'sp500', 'edo', 'deposit', 'gold', 'home', 'custom'];

/** Id presetu w zbiorze danych (mieszkanie i własne nie mają presetu w formularzu). */
export const TILE_PRESET: Record<Exclude<TileKind, 'home' | 'custom'>, string> = {
  btc: 'btcBase',
  world: 'globalEquity',
  sp500: 'usEquity',
  edo: 'edo',
  deposit: 'deposit',
  gold: 'gold',
};

/** Nazwy aktywów po polsku (kafelki i lista pozycji). */
export function useAssetNames(): { tile: (k: TileKind) => string; asset: (assetId: string) => string } {
  const { t } = useLingui();
  const names: Record<string, string> = {
    btc: t`Bitcoin`,
    world: t`ETF na świat`,
    sp500: t`S&P 500`,
    edo: t`Obligacje EDO`,
    deposit: t`Lokata`,
    gold: t`Złoto`,
    home: t`Mieszkanie`,
    custom: t`Własne`,
  };
  const byAsset: Record<string, string> = {
    btcBase: names.btc!,
    btcPessimistic: names.btc!,
    btcOptimistic: names.btc!,
    ethBase: t`Ethereum`,
    globalEquity: names.world!,
    usEquity: names.sp500!,
    edo: names.edo!,
    deposit: names.deposit!,
    gold: names.gold!,
    emEquity: t`Akcje rynków wschodzących`,
    wigEquity: t`Akcje polskie`,
    plBonds: t`Obligacje polskie`,
    globalBonds: t`Obligacje świata`,
  };
  return {
    tile: (k) => names[k]!,
    asset: (id) => byAsset[id] ?? (id.startsWith('custom:') ? id.slice(7) : id),
  };
}
