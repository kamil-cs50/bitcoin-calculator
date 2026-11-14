import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Formula } from './Formula';

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** Aneks ze wzorami. Zapis TeX jest w formulas.ts; tu opisy (Lingui) i podział na grupy. */
export function Annex() {
  return (
    <div className="flex flex-col gap-6">
      <Group title={<Trans>Krok czasowy i liczby losowe</Trans>}>
        <Formula id="drift">
          <Trans>
            Dryf miesięczny z mediany CAGR i krok wartości portfela z kosztem funduszu (TER).
          </Trans>
        </Formula>
        <Formula id="seed">
          <Trans>
            Ziarno strumienia dla ścieżki p i czynnika k (fmix32 to finalizator MurmurHash3).
          </Trans>
        </Formula>
        <Formula id="uniform">
          <Trans>
            Liczba jednostajna z 32-bitowego wyniku generatora, zawsze ściśle między 0 a 1.
          </Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Grube ogony</Trans>}>
        <Formula id="scale">
          <Trans>
            Tabela skali z kwantyli rozkładu chi-kwadrat, znormalizowana do jednostkowej wariancji.
          </Trans>
        </Formula>
        <Formula id="shock">
          <Trans>
            Szok miesięczny: wspólna skala razy czynnik Cholesky’ego razy standardowy szum normalny.
          </Trans>
        </Formula>
        <Formula id="arithmeticMean">
          <Trans>
            Średnia arytmetyczna wykładnika zwrotu w modelu bez reżimów (liczona z tabeli skali).
          </Trans>
        </Formula>
        <Formula id="arithmeticMeanRegime">
          <Trans>
            To samo w modelu z reżimami (rozkład stacjonarny reżimów razem z tabelą skali).
          </Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Reżimy rynku</Trans>}>
        <Formula id="chain">
          <Trans>Rozkład stacjonarny łańcucha dwóch stanów i jego trwałość.</Trans>
        </Formula>
        <Formula id="regimeReturn">
          <Trans>
            Zwrot czynnika i w miesiącu t: dryf, przesunięcie kryzysowe i szok z mnożnikiem
            zmienności.
          </Trans>
        </Formula>
        <Formula id="delta">
          <Trans>Przesunięcia reżimowe o zerowej średniej i ich wariancja.</Trans>
        </Formula>
        <Formula id="kappa">
          <Trans>Mnożnik zmienności aktywa w reżimie i macierz mnożników.</Trans>
        </Formula>
        <Formula id="omega">
          <Trans>
            Udział wariancji rocznej pochodzący z reżimu (ograniczony walidacją do 0,8).
          </Trans>
        </Formula>
        <Formula id="sigmaM">
          <Trans>
            Zmienność miesięczna szoków tak, aby roczna wariancja zgadzała się z wpisaną.
          </Trans>
        </Formula>
        <Formula id="rTilde">
          <Trans>
            Korelacja szoków wewnątrz reżimu, dla której korelacja roczna równa się wpisanej.
          </Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Niepewność parametrów</Trans>}>
        <Formula id="uncertainty">
          <Trans>
            Skorelowane przesunięcia dryfu na ścieżkę; mediana bez zmian, średnia rośnie o podany
            czynnik.
          </Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Inflacja</Trans>}>
        <Formula id="inflation">
          <Trans>Proces inflacji trendu i indeks cen.</Trans>
        </Formula>
        <Formula id="inflationYoY">
          <Trans>Inflacja rok do roku i losowana długookresowa średnia ścieżki.</Trans>
        </Formula>
        <Formula id="inflationCalib">
          <Trans>
            Wariancja inflacji rok do roku jako suma 12 przyrostów miesięcznych procesu.
          </Trans>
        </Formula>
        <Formula id="rho12">
          <Trans>
            Autokorelacja inflacji rok do roku przy opóźnieniu 12 miesięcy (rozwiązywana bisekcją
            względem φ).
          </Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Waluty</Trans>}>
        <Formula id="fxReal">
          <Trans>Realny kurs wraca do średniej z półokresem H lat.</Trans>
        </Formula>
        <Formula id="fxNominal">
          <Trans>Kurs nominalny z realnego kursu, inflacji polskiej i zagranicznej.</Trans>
        </Formula>
        <Formula id="fxVar">
          <Trans>
            Wariancja 12-miesięcznej zmiany realnego kursu, z której wyznaczamy zmienność
            miesięczną.
          </Trans>
        </Formula>
        <Formula id="effectiveVol">
          <Trans>Roczna zmienność aktywa zagranicznego w złotych.</Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Typy aktywów</Trans>}>
        <Formula id="deposit">
          <Trans>
            Stopa lokaty podąża za inflacją plus rozpiętość z szybkością k, bez wartości ujemnych.
          </Trans>
        </Formula>
        <Formula id="cryptoDecay">
          <Trans>
            Zanik wzrostu i zmienności kryptowaluty od wartości początkowych do długookresowych.
          </Trans>
        </Formula>
        <Formula id="collapse">
          <Trans>Upadek: strata części L wartości i prawdopodobieństwo upadku do roku T.</Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Podatki i księgowość</Trans>}>
        <Formula id="taxSecurities">
          <Trans>
            Papiery wartościowe: P to przychody, K koszt metodą FIFO, O odliczenie strat z
            poprzednich lat.
          </Trans>
        </Formula>
        <Formula id="taxCrypto">
          <Trans>
            Kryptowaluty: przychody roku minus wydatki roku i nadwyżka kosztów z lat poprzednich.
          </Trans>
        </Formula>
        <Formula id="accounting">
          <Trans>Tożsamość księgowa sprawdzana testem na każdej ścieżce.</Trans>
        </Formula>
        <Formula id="real">
          <Trans>Wartość realna jako wartość nominalna podzielona przez indeks cen ścieżki.</Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Wypłaty</Trans>}>
        <Formula id="pmt">
          <Trans>
            Rata amortyzacji płatna z góry: r to oczekiwany realny zwrot, n pozostałe lata, W
            wartość portfela.
          </Trans>
        </Formula>
      </Group>

      <Group title={<Trans>Statystyki</Trans>}>
        <Formula id="quantile">
          <Trans>Percentyl typu 7.</Trans>
        </Formula>
        <Formula id="wilson">
          <Trans>Przedział ufności Wilsona dla prawdopodobieństwa.</Trans>
        </Formula>
        <Formula id="quantileCI">
          <Trans>Nieparametryczny przedział ufności percentyla ze statystyk pozycyjnych.</Trans>
        </Formula>
        <Formula id="cvar">
          <Trans>Średnia z najgorszych 5% wartości końcowych.</Trans>
        </Formula>
        <Formula id="twr">
          <Trans>
            Realny roczny zwrot portfela ważony czasem (I to indeks portfela, T horyzont w
            miesiącach).
          </Trans>
        </Formula>
        <Formula id="ruinAlive">
          <Trans>Prawdopodobieństwo wyczerpania środków za życia z krzywą przeżycia S.</Trans>
        </Formula>
        <Formula id="bootstrap">
          <Trans>
            Bootstrap stacjonarny: nowy blok zaczyna się z prawdopodobieństwem 1/L w każdym kroku.
          </Trans>
        </Formula>
      </Group>
    </div>
  );
}
