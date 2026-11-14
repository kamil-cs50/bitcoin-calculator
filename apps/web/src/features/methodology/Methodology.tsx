import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Card } from '../../components/ui/Card';
import { Annex } from './Annex';
import { BIBLIOGRAPHY, type Reference } from './bibliography';
import { Cite } from './Cite';

function Section({
  spec,
  name,
  title,
  children,
}: {
  /** Numer sekcji w spec (4.1–4.14). */
  spec?: string;
  /** Znacznik sekcji spoza spec. */
  name?: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-spec={spec}
      data-section={name}
      id={spec ? `s-${spec.replace('.', '-')}` : name}
      className="flex flex-col gap-3"
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-border bg-accent-soft p-3 text-accent-soft-fg">
      {children}
    </p>
  );
}

function referenceText(b: Reference): string {
  const authors = b.authors.join(', ');
  switch (b.kind) {
    case 'article':
      return `${authors} (${b.year}). ${b.title}. ${b.journal}, ${b.volume}${b.issue ? `(${b.issue})` : ''}, ${b.pages}.`;
    case 'book':
      return `${authors} (${b.year}). ${b.title}${b.edition ? ` (${b.edition})` : ''}. ${b.publisher}.`;
    case 'dataset':
      return `${authors} (${b.year}). ${b.title}. ${b.url} (${t`dostęp: ${b.accessed}`}).`;
  }
}

export function Methodology() {
  return (
    <div className="flex flex-col gap-8 leading-relaxed">
      <h1 className="text-2xl font-semibold">
        <Trans>Metodologia</Trans>
      </h1>

      <Card>
        <p>
          <Trans>
            Ta strona wyjaśnia prostym językiem, jak działa symulacja i czego nie potrafi. Wzory są
            w aneksie na końcu. Pełny opis techniczny jest też w pliku docs/METHODOLOGY.md w
            repozytorium.
          </Trans>
        </p>
        <p className="mt-3">
          <Trans>
            Najważniejsze zdanie: model nie jest prognozą. Pokazuje, jak mogą potoczyć się losy
            portfela przy założeniach, które możesz zobaczyć i zmienić, a nie jak się potoczą. Wynik
            jest edukacyjny i nie stanowi rekomendacji inwestycyjnej.
          </Trans>
        </p>
      </Card>

      <Section spec="4.1" title={<Trans>Krok czasowy i kolejność zdarzeń</Trans>}>
        <p>
          <Trans>
            Symulacja idzie miesiąc po miesiącu, nawet do 80 lat. Każda z tysięcy możliwych
            przyszłości („ścieżka”) jest liczona osobno, od dziś do końca horyzontu. Liczymy
            logarytmiczne stopy zwrotu, więc cena nigdy nie spada poniżej zera, a niczego nie
            obcinamy sztucznie.
          </Trans>
        </p>
        <p>
          <Trans>
            Oczekiwany zwrot, który wpisujesz przy aktywie, to mediana długookresowego rocznego
            zwrotu (CAGR). Połowa przyszłości wypadnie lepiej, połowa gorzej. Zmienność to
            odchylenie standardowe rocznego logarytmicznego zwrotu przy ustalonych parametrach
            ścieżki.
          </Trans>
        </p>
        <p>
          <Trans>
            W każdym miesiącu zdarzenia następują w stałej kolejności: najpierw kalendarz (w
            styczniu ustalenie rocznej wypłaty i limitów IKE i IKZE, w kwietniu zapłata podatku za
            poprzedni rok), potem przychody do gotówki (odsetki, kupony, wykupy), potem Twoje wpłaty
            i wypłaty, potem rebalans, a na końcu zwrot rynku za miesiąc z kosztem funduszu (TER).
            Wpłaty i wypłaty następują więc z góry, na początku miesiąca.
          </Trans>
        </p>
        <p>
          <Trans>
            Sprzedaż z zyskiem zwiększa zobowiązanie podatkowe płatne w kwietniu następnego roku.
            Dlatego pokazujemy wartość „po podatku”: aktywa minus naliczony podatek, a także minus
            podatek, który zapłaciłbyś, sprzedając wszystko od razu. To kwota, którą realnie możesz
            wydać, więc ten widok jest domyślny.
          </Trans>
        </p>
        <p>
          <Trans>
            Ruina oznacza pierwszy miesiąc, w którym nie da się pokryć wypłaty z płynnych aktywów.
            Taka ścieżka zostaje w statystykach z wartością zero, a niedobory są sumowane. Ścieżek z
            ruiną nigdy nie wyrzucamy z wyników.
          </Trans>
        </p>
      </Section>

      <Section spec="4.2" title={<Trans>Liczby losowe</Trans>}>
        <p>
          <Trans>
            Losowość pochodzi z generatora xoshiro128** <Cite id="blackman2021" />, inicjowanego z
            ziarna. Dzięki temu ten sam scenariusz zawsze daje ten sam wynik, a zmiana jednego
            parametru nie rozsypuje całej reszty losowań.
          </Trans>
        </p>
        <p>
          <Trans>
            Każda ścieżka i każdy czynnik (aktywo, kurs, inflacja, reżim rynku i tak dalej) ma
            własny strumień liczb. Jedno losowanie zużywa dokładnie jedną liczbę, a liczby normalne
            powstają przez odwrócenie dystrybuanty algorytmem AS 241 <Cite id="wichura1988" />. Z
            tego wynika, że wynik nie zależy od liczby wątków, a dodanie aktywa nie zmienia losowań
            pozostałych.
          </Trans>
        </p>
        <p>
          <Trans>
            Porównując dwa scenariusze, używamy tych samych liczb losowych („wspólne liczby
            losowe”), więc różnica między nimi pochodzi ze zmiany założeń, a nie z przypadku.
            Świadomie nie stosujemy zmiennych antytetycznych ani quasi-Monte Carlo, bo psułyby
            niezależność ścieżek, na której opierają się przedziały ufności.
          </Trans>
        </p>
      </Section>

      <Section spec="4.3" title={<Trans>Grube ogony</Trans>}>
        <p>
          <Trans>
            Prawdziwe rynki miewają miesiące znacznie gorsze, niż pozwala zwykły rozkład normalny.
            Dlatego szok miesiąca mnożymy przez losową skalę, wspólną dla wszystkich czynników
            (aktywa, kursy, inflacja). W niektórych miesiącach wszystko drga mocniej naraz, co
            odtwarza współruch w kryzysach (por. McNeil, Frey i Embrechts <Cite id="mcneil2015" />
            ).
          </Trans>
        </p>
        <p>
          <Trans>
            Skala pochodzi z tabeli 1024 wartości skonstruowanej z rozkładu t-Studenta, ale z
            ograniczonym zakresem. Surowy rozkład t ma nieskończoną wartość oczekiwaną wykładnika
            zwrotu, więc średnia wartość portfela formalnie by nie istniała <Cite id="geweke2001" />
            . Ograniczona skala zachowuje grube ogony, a daje skończone średnie i dokładnie
            jednostkową wariancję. Domyślnie stopnie swobody wynoszą 5 i jest to założenie, nie
            wynik kalibracji.
          </Trans>
        </p>
        <p>
          <Trans>
            Jeśli wpiszesz własną macierz korelacji, która nie jest poprawna (nie jest dodatnio
            określona), aplikacja zastąpi ją najbliższą poprawną macierzą metodą Highama{' '}
            <Cite id="higham2002" />, pokaże ostrzeżenie i macierz po korekcie.
          </Trans>
        </p>
      </Section>

      <Section spec="4.4" title={<Trans>Reżimy rynku</Trans>}>
        <p>
          <Trans>
            Rynek przełącza się między dwoma stanami: spokojnym i kryzysowym (model Hamiltona{' '}
            <Cite id="hamilton1989" />w wersji do zwrotów długookresowych Hardy’ego{' '}
            <Cite id="hardy2001" />
            ). W kryzysie zmienność rośnie, a aktywa wrażliwe na kryzys tracą średnio więcej.
            Domyślnie kryzys zdarza się w około jednym miesiącu na sześć i zwykle trwa kilka
            miesięcy.
          </Trans>
        </p>
        <p>
          <Trans>
            Reżimy są skalibrowane tak, żeby nie zmieniać tego, co wpisałeś: średnia roczna zwrotu,
            zmienność roczna i korelacje roczne wychodzą w symulacji tak, jak w formularzu. Reżimy
            tylko zmieniają kształt rozkładu (lewoskośność, kryzysy) bez zmiany tych liczb.
          </Trans>
        </p>
        <p>
          <Trans>
            Nie ma osobnych macierzy korelacji dla kryzysu. Wzrost współruchu w kryzysie dają już
            wspólne przesunięcie średniej, wspólny mnożnik zmienności i wspólna skala ogonów. Duża
            część obserwowanego „wzrostu korelacji” to po prostu skutek wyższej zmienności{' '}
            <Cite id="forbes2002" />.
          </Trans>
        </p>
        <p>
          <Trans>
            W trybie eksperta możesz wybrać model podręcznikowy (ruch Browna z geometrycznym
            wzrostem, bez reżimów i bez grubych ogonów). W takim modelu mediana wartości końcowej
            jest dokładnie równa wpisanemu CAGR. W modelu realistycznym mediana jest nieco wyższa,
            bo rozkład jest lekko lewoskośny; zachowana jest dokładnie średnia logarytmów zwrotu.
          </Trans>
        </p>
      </Section>

      <Section spec="4.5" title={<Trans>Niepewność parametrów</Trans>}>
        <p>
          <Trans>
            Nikt nie zna prawdziwego oczekiwanego zwrotu aktywa. Dlatego w każdej ścieżce losujemy
            małe stałe przesunięcie rocznego dryfu, z odchyleniem równym błędowi standardowemu (SE)
            danego aktywa. Przesunięcia są skorelowane między aktywami tak jak same aktywa: jeśli
            premia za ryzyko okaże się niższa, to dla wszystkich akcji naraz{' '}
            <Cite id="barberis2000" /> <Cite id="pastor2012" />.
          </Trans>
        </p>
        <p>
          <Trans>
            Przesunięcie jest symetryczne w logarytmach, więc mediana wartości końcowej zostaje
            taka, jak wpisany CAGR. Za to średnia rośnie, bo rzadkie bardzo dobre scenariusze ją
            zawyżają. Dlatego wynikiem głównym są mediana i pasma, a średnia pojawia się tylko w
            trybie eksperta z odpowiednim opisem. Suwak „Jak pewny jesteś oczekiwanego zwrotu?”
            skaluje wszystkie SE (od 0 do 2 razy).
          </Trans>
        </p>
        <p>
          <Trans>
            Tak samo losujemy długookresową inflację: różnica między 2,5% a 3,5% rocznie przez 30
            lat zmienia wartość realną o około jedną czwartą. Niepewności samej zmienności nie
            modelujemy, bo wariancję szacuje się z danych o rząd wielkości dokładniej niż średnią{' '}
            <Cite id="merton1980" />.
          </Trans>
        </p>
      </Section>

      <Section spec="4.6" title={<Trans>Inflacja (Polska)</Trans>}>
        <p>
          <Trans>
            Inflacja jest procesem, który wraca do długookresowej średniej, ale powoli. Startujemy
            od ostatniego odczytu rok do roku, a nie od odczytu miesięcznego, który mógłby dać
            absurdalną inflację roczną. W zbiorze danych jest 13 ostatnich poziomów indeksu cen,
            żeby inflacja roczna i indeksacja obligacji EDO były poprawne od pierwszego miesiąca.
          </Trans>
        </p>
        <p>
          <Trans>
            Kalibrujemy proces do odchylenia i autokorelacji inflacji rok do roku (opóźnienie 12
            miesięcy). Trzeba pamiętać, że inflacja rok do roku jest sumą 12 przyrostów
            miesięcznych, więc jej autokorelacja nie jest autokorelacją procesu miesięcznego; wzory
            są w aneksie. Deflacja jest dozwolona (Polska miała ją w latach 2014–2016).
          </Trans>
        </p>
        <p>
          <Trans>
            Indeks cen na każdej ścieżce służy do przeliczania na złote realne, indeksowania wpłat i
            wypłat oraz do obligacji EDO. Inflację zagraniczną (USD, EUR) przyjmujemy jako stałą.
          </Trans>
        </p>
      </Section>

      <Section spec="4.7" title={<Trans>Waluty</Trans>}>
        <p>
          <Trans>
            Aktywo w dolarach lub euro zachowuje się jak aktywo w złotych razem z kursem. Realny
            kurs walutowy nie błądzi bez końca, tylko powoli wraca do parytetu siły nabywczej, z
            półokresem rzędu 3–5 lat (domyślnie 4 lata) <Cite id="rogoff1996" />{' '}
            <Cite id="taylor2004" />. Gdyby kurs był zwykłym błądzeniem, jego wariancja rosłaby bez
            ograniczeń.
          </Trans>
        </p>
        <p>
          <Trans>
            Zmienność kursu w tabelach to odchylenie rocznej zmiany logarytmu realnego kursu, bo to
            się mierzy w danych. Z niej wyliczamy zmienność miesięczną procesu. Panel „Kontrola
            modelu” pokazuje łączną zmienność aktywa w złotych, uwzględniającą kurs i jego korelację
            z aktywem.
          </Trans>
        </p>
        <p>
          <Trans>
            Domyślnie nie zakładamy trwałego umacniania ani osłabiania złotego w ujęciu realnym
            (efekt Balassy i Samuelsona jest parametrem eksperta, domyślnie zerowym).
          </Trans>
        </p>
      </Section>

      <Section spec="4.8" title={<Trans>Typy aktywów</Trans>}>
        <p>
          <Trans>
            Aktywa ryzykowne (akcje, ETF, złoto, własne) używają modelu z sekcji o grubych ogonach,
            reżimach i niepewności parametrów. Lokata to stopa, która z opóźnieniem podąża za
            inflacją plus rozpiętość, z odsetkami naliczanymi miesięcznie i podatkiem 19% przy
            wypłacie. Obligacje stałokuponowe to aktywo ryzykowne o niskiej zmienności, ujemnie
            skorelowane z szokami inflacji.
          </Trans>
        </p>
        <p>
          <Trans>
            Obligacje EDO modelujemy partiami zakupu: w pierwszym roku stałe oprocentowanie, potem
            inflacja sprzed dwóch miesięcy plus marża, kapitalizacja roczna. Po 10 latach wykup z
            podatkiem od całych odsetek i reinwestycją. Przy wykupie przedterminowym płaci się
            opłatę (3 zł od obligacji za 100 zł, nie więcej niż narosłe odsetki), a wykupywane są
            najstarsze partie.
          </Trans>
        </p>
        <p>
          <Trans>
            Kryptowaluty mają dodatkowo zanik: wzrost i zmienność powoli maleją od wartości
            początkowych do długookresowych. Upadek (np. utrata zaufania) to zdarzenie losowe o
            ustalonej intensywności na rok, po którym wartość spada o zadany procent (domyślnie
            95%), a dryf wynosi zero. Wpisany CAGR to mediana warunkowa na przetrwaniu: dryfu nie
            podnosimy w zamian za ryzyko upadku, bo to zawyżałoby typowy wynik. Osobno pokazujemy
            prawdopodobieństwo upadku do wybranego roku.
          </Trans>
        </p>
        <p>
          <Trans>
            Parametry dryfu BTC i ETH są założeniami, nie danymi. Zmienność zrealizowana jest
            zmierzona, ale historyczny wzrost cen zależy od punktów końcowych, więc nie służy do
            kalibracji. W trybie eksperta można włączyć opcjonalną nakładkę potęgową, domyślnie
            wyłączoną i oznaczoną jako model kontrowersyjny: regresja ceny na czasie jest podatna na
            regresję pozorną i nie ma podstaw ekonomicznych, a jej parametry wpisujesz sam.
          </Trans>
        </p>
        <p>
          <Trans>
            Nieruchomość występuje w dwóch wariantach: „mieszkam” (liczy się tylko majątek netto) i
            „na wynajem” (cena jako aktywo ryzykowne w ujęciu realnym plus czynsz netto jako
            przychód). Jest niepłynna: nie bierze udziału w rebalansie ani częściowej sprzedaży,
            tylko w zdarzeniu „sprzedaż w roku X”.
          </Trans>
        </p>
      </Section>

      <Section spec="4.9" title={<Trans>Portfel, rebalans i koszty</Trans>}>
        <p>
          <Trans>
            Rebalans może być wyłączony, roczny (w styczniu), progowy (gdy udział aktywa wyjdzie
            poza pasmo o zadaną liczbę punktów procentowych) albo odbywać się tylko przez kierowanie
            wpłat. Każde aktywo ma koszt transakcji w punktach bazowych. Każda sprzedaż przechodzi
            przez moduł podatkowy.
          </Trans>
        </p>
        <p>
          <Trans>
            Wypłaty pokrywamy w stałej kolejności: gotówka i lokaty, potem aktywa przeważone
            względem celu, na końcu EDO (wykup przedterminowy). Nieruchomość i EDO nie uczestniczą w
            rebalansie.
          </Trans>
        </p>
        <p>
          <Trans>
            Każda pozycja należy do konta: zwykłego, IKE albo IKZE. IKE i IKZE mają roczne limity
            wpłat i własne reguły podatkowe (opisane w sekcji o podatkach i w uproszczeniach).
            Wpłata ponad limit trafia na konto zwykłe.
          </Trans>
        </p>
      </Section>

      <Section spec="4.10" title={<Trans>Podatki (Polska)</Trans>}>
        <Note>
          <Trans>
            Przepisy podatkowe w modelu są zapisane z pamięci i nie zostały sprawdzone w oficjalnym
            źródle (ISAP). To uproszczony model edukacyjny, nie porada podatkowa. Szczegóły w sekcji
            „Uproszczenia i ograniczenia”.
          </Trans>
        </Note>
        <p>
          <Trans>
            Papiery wartościowe (akcje, ETF, ETP): 19% od rocznego dochodu, koszt nabycia metodą
            FIFO (najstarsze kupione jednostki sprzedawane są pierwsze), osobno dla każdego
            rachunku. Strata z papierów obniża dochód przez kolejnych pięć lat według reguły
            opisanej w uproszczeniach.
          </Trans>
        </p>
        <p>
          <Trans>
            Kryptowaluty kupione bezpośrednio (nie przez fundusz giełdowy) rozlicza się inaczej: bez
            FIFO. Dochód roczny to przychody ze sprzedaży minus wydatki na zakup poniesione w tym
            samym roku (także na niesprzedane jednostki) minus nadwyżka kosztów z lat poprzednich.
            Nadwyżka przechodzi na kolejne lata bez limitu czasu i nie łączy się z papierami
            wartościowymi. Kryptowaluta w funduszu giełdowym (ETP) to zwykły papier wartościowy.
          </Trans>
        </p>
        <p>
          <Trans>
            Złoto fizyczne sprzedane po upływie pół roku od końca miesiąca zakupu nie podlega PIT, a
            fundusz na złoto (ETC) to papier wartościowy. Odsetki lokat i obligacji: 19% u źródła,
            bez kompensaty ze stratami. EDO: podatek od sumy odsetek przy wykupie. Najem: ryczałt
            8,5% do 100 000 zł przychodu rocznie i 12,5% powyżej. Podatek za dany rok płacimy w
            kwietniu następnego roku, z gotówki, a gdy jej brakuje, ze sprzedaży aktywów.
          </Trans>
        </p>
        <p>
          <Trans>
            Dla osób spoza Polski są tryby „bez podatków” i „stawka ogólna” (jedna stawka od zysku
            przy sprzedaży). Poza zakresem: danina solidarnościowa, zaokrąglenia do pełnych złotych,
            dywidendy i podatek u źródła od zagranicznych dywidend.
          </Trans>
        </p>
      </Section>

      <Section spec="4.11" title={<Trans>Wpłaty i wypłaty</Trans>}>
        <p>
          <Trans>
            Wpłaty miesięczne mają kwotę, rok końca i indeksację: brak, inflacja albo inflacja plus
            realny wzrost. Wypłaty zaczynają się od wybranego roku i mogą mieć jedną z kilku reguł:
            stała kwota realna (rośnie z symulowaną inflacją), stały procent portfela (ustalany w
            styczniu, wypłacany w 12 ratach, więc portfel nigdy się nie wyczerpuje), amortyzacja
            albo reguły Guytona i Klingera.
          </Trans>
        </p>
        <p>
          <Trans>
            Amortyzacja liczy w styczniu ratę jak rentę z góry (jak funkcja PMT w arkuszu) z
            pozostałych lat i oczekiwanego realnego zwrotu portfela, z opcjonalną podłogą i sufitem{' '}
            <Cite id="waring2015" />. Reguły Guytona i Klingera <Cite id="guyton2006" /> to zestaw
            sprzężonych zasad: coroczna indeksacja wypłaty (pomijana po ujemnym roku, jeśli stopa
            wypłaty jest ponad startową), ochrona kapitału (obcięcie wypłaty, gdy stopa wzrośnie za
            bardzo, ale nie w ostatnich 15 latach planu) i reguła dobrobytu (podwyżka, gdy stopa
            spadnie). W aplikacji ich parametry są stałe, a Ty wpisujesz tylko stopę startową.
          </Trans>
        </p>
        <p>
          <Trans>
            Procent portfela, Guyton–Klinger i amortyzacja liczą się od majątku płynnego po
            podatku, bez niepłynnej nieruchomości, bo mieszkania nie da się wypłacać po kawałku.
            Gdyby doliczyć mieszkanie, stopa wypłat byłaby liczona od majątku, którego nie ma
            czym wypłacić, a reguły G-K ochrony i dobrobytu oceniałyby ją względem niewłaściwego
            portfela.
          </Trans>
        </p>
        <p>
          <Trans>
            Dodatkowo można wpisać zdarzenia jednorazowe (kwota realna albo nominalna, data, znak).
          </Trans>
        </p>
      </Section>

      <Section spec="4.12" title={<Trans>Śmiertelność</Trans>}>
        <p>
          <Trans>
            Jeśli podasz wiek i płeć (w Planie, oba pola są opcjonalne), aplikacja policzy w
            Wynikach prawdopodobieństwo wyczerpania środków za Twojego życia. Bierze pod uwagę, że ruina w odległym roku liczy się tylko wtedy, gdy
            dożyjesz tego roku. Używamy tablic trwania życia GUS (rok 2025); śmiertelność całkujemy
            analitycznie, bez dodatkowego szumu.
          </Trans>
        </p>
        <p>
          <Trans>
            Tablice okresowe zaniżają długość życia kolejnych roczników, bo medycyna się poprawia.
            Dlatego jest opcja „+2 lata” (założenie, w Planie, domyślnie wyłączona). Przedział ufności tego wyniku uwzględnia tylko
            błąd losowania symulacji rynku, a nie niepewność tablic.
          </Trans>
        </p>
      </Section>

      <Section spec="4.13" title={<Trans>Statystyki i solvery</Trans>}>
        <p>
          <Trans>
            Wachlarz pokazuje percentyle 5, 10, 25, 50, 75, 90 i 95 wartości portfela w kolejnych
            latach, w złotych realnych albo nominalnych. Percentyle liczymy metodą typu 7{' '}
            <Cite id="hyndman1996" />, tą samą co w Excelu i NumPy. Prawdopodobieństwa mają
            przedziały ufności Wilsona <Cite id="wilson1927" />, a percentyle: przedziały
            nieparametryczne z rozkładu dwumianowego.
          </Trans>
        </p>
        <p>
          <Trans>
            Liczba ścieżek rośnie w stałych etapach (1 000, 4 000, 10 000, opcjonalnie 25 000). Nie
            zatrzymujemy symulacji, gdy wynik „wygląda dobrze”, bo to psułoby przedziały ufności.
            Plakietka pokazuje osiągniętą dokładność. Pokazujemy też: prawdopodobieństwo osiągnięcia
            celu, realnej straty i ruiny, rozkład maksymalnego obsunięcia (liczony co miesiąc na
            indeksie portfela, nie na wartości zniekształconej wpłatami) i „najgorsze 5%
            przyszłości: średnio X” (średnia z najniższych 5% wartości końcowych).
          </Trans>
        </p>
        <p>
          <Trans>
            Solvery odpowiadają na pytania „ile mogę bezpiecznie wypłacać” i „ile muszę wpłacać”.
            Szukają kwoty bisekcją na wspólnych liczbach losowych. W ogólnym przypadku
            prawdopodobieństwo sukcesu jako funkcja kwoty jest schodkowa i tylko prawie monotoniczna
            (większa wypłata może uruchomić rebalans, który akurat pomoże), więc zwracamy mniej
            korzystny koniec znalezionego przedziału: niższą wypłatę, wyższą wpłatę. Solver używa 4
            000 ścieżek; wynik warto potwierdzić pełnym przebiegiem.
          </Trans>
        </p>
        <p>
          <Trans>
            Wkład aktywów w ryzyko liczymy dla wag początkowych na kowariancji rocznych zwrotów.
            Porównanie scenariuszy pokazuje różnicę mediany i dolnego percentyla z przedziałem
            ufności z bootstrapu parami ścieżek.
          </Trans>
        </p>
      </Section>

      <Section spec="4.14" title={<Trans>Wydajność i pamięć</Trans>}>
        <p>
          <Trans>
            Obliczenia idą w puli Web Workerów, poza głównym wątkiem, więc strona nie zamarza. Pętla
            miesięczna działa na wcześniej przydzielonych tablicach, bez alokacji, a wyniki wracają
            bez kopiowania. Wynik nie zależy od liczby wątków.
          </Trans>
        </p>
        <p>
          <Trans>
            Wyniki zapisujemy na siatce czasu: miesięcznej do 10 lat, kwartalnej do 40 lat i
            półrocznej powyżej, aby zmieścić się w budżecie pamięci 64 MB. Limit ścieżek to 10 000
            na telefonie i 25 000 na komputerze. Zmiana parametrów anuluje trwające liczenie (po 250
            ms bezczynności), a wyniki pojawiają się stopniowo, po każdym etapie.
          </Trans>
        </p>
      </Section>

      <Section name="verification" title={<Trans>Jak sprawdzamy poprawność</Trans>}>
        <p>
          <Trans>
            Silnik ma testy statystyczne: generatory sprawdzamy testem zgodności i momentami, wzory
            zamknięte (mediana GBM, zerowa zmienność, rata PMT) porównujemy z wartością dokładną, a
            kalibrację reżimów i ogonów z wpisanymi wartościami (średnia, wariancja i korelacje
            roczne w granicach czterech błędów standardowych). Testy księgowe sprawdzają na każdej
            ścieżce, że wartość końcowa zgadza się z początkową plus zyski, wpłaty, wypłaty, podatki
            i koszty. Ręcznie policzone przypadki podatkowe pokrywają FIFO, straty, krypto i EDO.
          </Trans>
        </p>
        <p>
          <Trans>
            Dodatkowo model porównaliśmy z historią: rozkład 10- i 20-letnich realnych zwrotów akcji
            USA z modelu ma objąć historyczne okna z danych Shillera <Cite id="shiller" />. Wynik i
            jego ograniczenia opisujemy otwarcie w sekcji „Uproszczenia i ograniczenia”. Kod
            bootstrapu historycznego (blokowy, stacjonarny <Cite id="politis1994" />) jest w
            silniku, ale nie jest podłączony do interfejsu.
          </Trans>
        </p>
      </Section>

      <Section name="data" title={<Trans>Skąd są dane</Trans>}>
        <p>
          <Trans>
            Parametry aktywów to prognozy instytucji (J.P. Morgan, Vanguard, AQR i inne), dane
            (tablice GUS, oferta obligacji skarbowych, zmienność zrealizowana BTC) i nasze
            założenia. Przy każdym parametrze w panelu „Założenia i źródła” widać, czym jest (dane,
            prognoza albo założenie) i czy został sprawdzony u źródła. Parametr niesprawdzony ma
            widoczną plakietkę. Parametry nieruchomości opierają się na długim szeregu historycznym{' '}
            <Cite id="jorda2019" />, ale ich dokładne wartości są założeniami.
          </Trans>
        </p>
        <p>
          <Trans>
            Aplikacja zawiera tylko statystyki pochodne i cytowania, nie surowe szeregi. Kalibracja
            używa też estymatora kowariancji Ledoita i Wolfa <Cite id="ledoit2004" />. Notowania BTC
            i kursy walut pobieramy tylko na Twoje żądanie, a dane portfela nigdy nie opuszczają
            urządzenia.
          </Trans>
        </p>
      </Section>

      <Section name="limitations" title={<Trans>Uproszczenia i ograniczenia</Trans>}>
        <Note>
          <Trans>
            Model nie jest prognozą ani rekomendacją. Uczciwa lista poniżej mówi, gdzie model
            upraszcza rzeczywistość lub opiera się na niesprawdzonych wartościach. Im więcej tu
            punktów dotyczy Twojej sytuacji, tym ostrożniej czytaj wynik.
          </Trans>
        </Note>
        <ul className="flex list-disc flex-col gap-3 pl-6">
          <li>
            <Trans>
              <b>Backtest nie dowodzi, że model jest dobry.</b> Test T9 sprawdza, czy rozkład 10- i
              20-letnich realnych zwrotów akcji USA z modelu obejmuje historyczne okna (dane
              Shillera, 1871–2024). Przechodzi tylko wtedy, gdy uwzględnimy niepewność parametrów;
              bez niej model nie przechodzi (górny ogon). Zgodność wynika głównie z szerokości
              rozkładu modelu, nie z jego środka: mediana modelu to około 3% realnie, a w historii
              około 7%. Wynika to stąd, że domyślne założenia to ostrożna prognoza (6% nominalnie),
              a nie dopasowanie do przeszłości. Okna historyczne nakładają się (to kilkanaście
              niezależnych obserwacji dla 10 lat i kilka dla 20 lat), dotyczą jednego kraju, który
              przetrwał, a inflacja w teście jest stała.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Większość parametrów to założenia.</b> Zmienności, korelacje, błędy standardowe,
              ładunki kryzysowe, parametry reżimów i grubości ogonów nie zostały skalibrowane na
              realnych danych i mają status niezweryfikowanych. Inflacja nie została skalibrowana na
              miesięcznym szeregu GUS (nie udało się go pobrać). Skrypty kalibracyjne istnieją i
              będą uruchomione, gdy dostarczymy pliki wejściowe.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Przepisy podatkowe są z pamięci, niezweryfikowane w ISAP.</b> Serwis ISAP nie był
              dostępny dla narzędzi użytych przy budowie (pętla przekierowań), więc brzmienie ustaw
              (PIT, ustawa o ryczałcie, ustawa o IKE i IKZE) nie zostało potwierdzone. Dotyczy to
              stawek, 5 lat zwolnienia nieruchomości, progu ryczałtu najmu, zasad krypto i limitów
              IKE i IKZE (limity pochodzą ze źródeł wtórnych, Monitor Polski nie był dostępny).
              Przed użyciem tych wyników do decyzji podatkowej sprawdź aktualne przepisy.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Rozliczanie strat z papierów to heurystyka zachłanna.</b> Zgodnie z naszym
              odczytaniem art. 9 ust. 3 ustawy o PIT stratę można odliczyć przez 5 kolejnych lat:
              jednorazowo do 5 mln zł w wybranym roku, a resztę w limicie 50% pierwotnej straty
              rocznie. Model wybiera zawsze pierwszy rok z dodatnim dochodem, i to nie jest
              optymalizacja podatnika: rzeczywisty podatnik może wybrać lepszy rok. Straty
              rozliczamy od najstarszych roczników. Strata powyżej 5 mln zł wywołuje ostrzeżenie.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Podatek od niezrealizowanych zysków jest przybliżeniem.</b> Wartość „po podatku”
              zakłada sprzedaż całości w jednym roku podatkowym, a rok likwidacji traktuje jak rok
              otwarty, więc wygaśnięcie strat liczone jest na ten rok. Dla krypto podatek utajony to
              19% z dodatniej części: przychody roku plus wartość pozycji minus koszty roku minus
              przeniesiona nadwyżka kosztów. Pomijamy złoto fizyczne trzymane krócej niż pół roku
              oraz zysk w IKE i IKZE. W rzeczywistości sprzedaż rozłożona na kilka lat dałaby inny
              podatek.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>IKE i IKZE są uproszczone.</b> Limity wpłat (2026 i 2027) są zaszyte w aplikacji ze
              źródeł wtórnych i rosną w symulacji o inflację plus 1 pp (założenie). Wypłata z IKE po
              60. roku życia jest wolna od podatku, a wcześniej opodatkowana 19% od zysku. Z IKZE po
              65. roku życia pobieramy 10% od całej kwoty, a wcześniej 19% od zysku, bez zwrotu
              wcześniej odliczonych kwot (w rzeczywistości wypłata z IKZE przed 65. rokiem życia to
              zwrot odliczeń, czego nie modelujemy). Pomijamy warunek 5 lat wpłat do IKE przed 60.
              rokiem życia i do IKZE przed 65. oraz wyższy limit IKZE dla prowadzących działalność
              gospodarczą. Wpłaty początkowe nie zużywają limitu. Wiek jest wymagany przy wyborze
              IKE lub IKZE i nie jest zakładany po cichu. Te zasady są cytowane z pamięci i
              niezweryfikowane w ISAP, o czym przypominamy też przy polu wieku i w Założeniach.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Nieruchomość jest uproszczona.</b> Jest niepłynna, bez częściowej sprzedaży i bez
              automatycznej sprzedaży przy niedoborze środków (przy ruinie jej wartość też jest
              zerowana w modelu, żeby bilans się zgadzał). Podatek od sprzedaży to 19% od zysku bez
              kosztów zbycia i nakładów; ryczałt od czynszu to 8,5% i 12,5% (progi
              niezweryfikowane). Rok zakupu, cenę zakupu i rok sprzedaży wpisujesz przy dodawaniu
              mieszkania albo w kafelku pozycji. Bez roku zakupu nie zakładamy zwolnienia po 5
              latach (podatek liczymy konserwatywnie), bez ceny zakupu koszt równa się wartości
              dziś, a bez roku sprzedaży mieszkania nie sprzedajemy w trakcie planu. Wartość „po
              podatku” odejmuje podatek od sprzedaży mieszkania. Zmienność i błąd standardowy ceny
              to założenia.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Kryptowaluty:</b> parametry dryfu BTC i ETH to założenia, nie prognozy. Upadek jest
              stanem pochłaniającym o stałej intensywności, a wpisany CAGR to mediana warunkowa na
              przetrwaniu, więc typowy wynik zakłada, że nie nastąpił. Nakładka potęgowa, jeśli ją
              włączysz, opiera się na regresji, która nie ma uzasadnienia ekonomicznego, a jej
              parametry są niezweryfikowane.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Waluty i inflacja zagraniczna.</b> Wzór na zmienność miesięczną kursu jest
              przybliżeniem: składnik reżimowy pomija tłumienie przez powrót do średniej, więc przy
              silnym wpływie kryzysu odchylenie roczne wychodzi o 2–5% niższe od wpisanego. Dla
              czynników autoregresyjnych (inflacja, kurs) wpisana korelacja oznacza korelację szoków
              miesięcznych, nie rocznych. Inflacja USA i strefy euro jest stała.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Zachowanie w drobnych przypadkach.</b> Niezapłacony podatek (brak środków) nie jest
              ruiną i przechodzi na kolejny kwiecień. Początkowe obligacje EDO traktujemy jak
              kupione w chwili zero, a wykup przedterminowy jest liniowy, bez zaokrąglania do
              obligacji po 100 zł. Przedziały dla prawdopodobieństwa ruiny za życia uwzględniają
              tylko błąd symulacji. Solver zwraca mniej korzystny koniec przedziału i jego wynik
              warto potwierdzić pełnym przebiegiem.
            </Trans>
          </li>
          <li>
            <Trans>
              <b>Czego nie ma w modelu:</b> zmian przepisów w przyszłości, niepewności samej
              zmienności, dywidend i podatku u źródła od zagranicznych dywidend, daniny
              solidarnościowej, kosztów życia poza wpisanymi wypłatami, a także trwałego trendu
              realnego kursu złotego. Wartości na przyszłość to pewne założenia, nie fakty.
            </Trans>
          </li>
        </ul>
      </Section>

      <Section name="literature" title={<Trans>Literatura</Trans>}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
          {BIBLIOGRAPHY.map((b) => (
            <li key={b.id} id={`lit-${b.id}`} className="scroll-mt-4">
              {referenceText(b)}
            </li>
          ))}
        </ul>
      </Section>

      <section id="aneks" aria-labelledby="aneks-h" className="flex flex-col gap-3">
        <h2 id="aneks-h" className="text-xl font-semibold">
          <Trans>Aneks: wzory</Trans>
        </h2>
        <p>
          <Trans>
            Dla czytających szczegółowo: wzory użyte w silniku. Symbole: g to mediana rocznego CAGR,
            σ zmienność roczna, ν stopnie swobody rozkładu t, T horyzont w latach, indeks i numeruje
            aktywa, p ścieżkę, t miesiąc.
          </Trans>
        </p>
        <Annex />
      </section>
    </div>
  );
}
