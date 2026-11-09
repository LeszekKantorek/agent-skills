# Plan weryfikacji według modelu V

Plan opisuje przyszłe testy, nie implementuje ich. Oczekiwania wyprowadzamy z reguł i potrzeb, nigdy z bieżącego wyjścia analizatora. Zakres: trzy metryki składniowe outer wraz z funkcjami wewnętrznymi i closures w Rust/JavaScript.

## Przypadki użycia i oczekiwany dowód

| ID | Potrzeba | Przypadek i kryterium |
| --- | --- | --- |
| UC-01 | Uruchomienie bez kompilacji | Czysta kopia skilla z zasobami vendor, sam Node, inne cwd; pierwsze i kolejne uruchomienie offline bez npm install i kompilacji; wymaganie Node jest udokumentowane; brak parsera daje kod 1. Przy braku Node kod analizatora nie jest uruchamiany — nie oczekujemy od niego komunikatu |
| UC-02 | Analiza plików i globów | Pliki i globy Rust/JS, ścieżki ze spacją i Unicode; analizowane wszystkie wskazane i dopasowane pliki, bez plików spoza zakresu; język po rozszerzeniu |
| UC-03 | Odnalezienie złożonych funkcji | Kompletne zestawienie trzech metryk wszystkich pasujących outer, również z null; bez automatycznej oceny architektury |
| UC-04 | Pomiar funkcji, metod i closures | Nazwane/anonimowe jednostki, metody, eksporty i zagnieżdżenia; poprawny właściciel oraz lokalizacja; wnętrze closure zwiększa Statements/Cyclomatic outer dokładnie raz; brak osobnego rekordu closure |
| UC-05 | Cognitive odróżnia zagnieżdżenia | Trzy płaskie if dają 3, trzy zagnieżdżone 6; zwykłe bloki nie dodają nesting; brak punktów za rekurencję |
| UC-06 | Pomiar rozmiaru instrukcjami | Trzy wywołania w jednej lub trzech liniach dają 3; return-call i declaration-call dają po 2; łańcuch dwóch metod daje 2; deklaracja dwóch zmiennych daje 2 |
| UC-07 | Kod odróżniony od tekstu | Komentarze, stringi, raw strings i regex zawierające if/klamry nie zwiększają wyników; kod w interpolacjach podlega analizie |
| UC-08 | Liczba decyzji | Pusta funkcja daje Cyclomatic 1 w obu językach; 4/8/64 if daje 5/9/65; trzy płaskie i zagnieżdżone if dają 4; dwa if z return dają 3 |
| UC-09 | Zgodny JSON i Markdown | Te same wartości liczbowe lub null, lokalizacje i wersje; null nie zamienia się w zero; liczniki całego raportu files, functions_found i functions_presented zgodne z wejściem i filtrem; stała kolejność według ścieżki pliku i pozycji funkcji |
| UC-10 | Niedostępny pomiar | Uszkodzony lub nieczytelny plik pozostaje w analyzed_files z językiem według rozszerzenia, bez rekordów funkcji; zwiększa tylko licznik plików. W poprawnie sparsowanym pliku niedostępna metryka rozpoznanej funkcji ma null. Bez opisu przyczyny i statusu. Pusta lista daje pusty raport i kod 0; błędne argumenty dają kod 1. Błąd jednego pliku nie zatrzymuje analizy pozostałych, a końcowy kod wynosi 1 |
| UC-11 | Porównywalne pomiary | Dwa uruchomienia dają ten sam raport; dodanie jednego atomowego if do już niepustej funkcji podnosi Cyclomatic o 1; niezmienione funkcje zachowują wyniki |
| UC-12 | Brak ingerencji w projekt | Brak zależności aplikacji nie blokuje parsowania; sama analiza odczytuje źródła |
| UC-13 | Rozszerzalność | Przegląd kontraktu adaptera: dodanie języka nie zmienia rendererów i istniejących reguł; bez pustych adapterów przyszłych języków |
| UC-14 | Jednakowe reguły między językami | Równoważne konstrukcje Rust/JavaScript mają te same ręcznie wyliczone wyniki wszystkich metryk |
| UC-15 | Explain przy kodzie | Przyrosty sumują się do wyniku outer; raport zastępuje komentarze punktacją; explain zawsze zwraca Markdown |
| UC-16 | Filtrowanie nazw outer | Dokładne nazwy rozdzielone pionową kreską; wszystkie pasujące rekordy; bez zmiany pomiarów i ukrywania błędów |

## Testy jednostkowe

- Cognitive: else-if, pętle, match/switch, skoki, closures i sekwencje logiczne. A–B–A nie może gubić ostatniej zmiany operatora; a || b && c || d ma koszt sekwencji 3. Osobne wyrażenia nie tworzą wspólnej sekwencji.
- Statements: deklaracje wielozmiennowe, destrukturyzacja, przypisania, return, Rust tail, expression-arrow, blok jako wartość, if jako initializer, wrappery i ASI.
- Cyclomatic: baza językowa według [reguł metryk](code-complexity-metric-rules.md), else bez punktu, każdy &&/|| także w argumencie i return, ternary, pętle, ciała closures wliczane do outer. Same return/break/continue i wywołania nie dodają punktów. Pozostałe konstrukcje według zatwierdzonej tabeli.
- Tożsama składnia wywołania funkcji własnej i bibliotecznej daje te same lokalne metryki. Nazwa metody ani typ odbiorcy nie są potrzebne.
- Samowywołanie i wzajemne wywołania nie otrzymują składnika rekurencji w Cognitive.
- Pary formatowań, komentarze, literały z klamrami, funkcje zagnieżdżone i kombinacje wspieranych konstrukcji.
- Niewspierana konstrukcja nie otrzymuje pozornej wartości zerowej; pełne wsparcie wymaganej konstrukcji nie może być zastąpione zwracaniem null. Sprawdzamy brak pól reason, reasons, message, diagnostics i statusu metryki w obu formatach raportu.

## Integracja i system

Parser → adapter: funkcje, zakresy, Unicode, wrappery i zachowanie null przy niedostępnym pomiarze.
Adapter → model → liczniki: równoważne przykłady Rust/JS i właściwe granice funkcji.
Metryki → raport: wartości liczbowe i null bez utraty danych, JSON/Markdown, pełne zestawienie po filtrze i stała kolejność rekordów.
CLI: argumenty, pliki i globy wejściowe, puste wejście, brak parsera i deterministyczność.

## Ustalenia i zadania weryfikacyjne

| ID | Stan |
| --- | --- |
| D-01 | Node 24 LTS ustalony jako minimalna wspierana linia; platformy pozostają do sprawdzenia; runtime oraz parsery są dostarczane w Git, bez setupu zależności użytkownika |
| D-02 | Zamknięte: reguły Cognitive zapisane w tabelach projektu, bez rekurencji; closures wliczamy do outer i zwiększamy zagnieżdżenie Cognitive; podstawowe reguły Statements są ustalone |
| D-03 | Zamknięte: punktacja Cyclomatic jest ustalona w lokalnych regułach metryk; implementować według tych tabel |
| D-04 | Do wykonania: pokrycie testami macierzy konstrukcja × pozycja: body, tail, initializer, argument, template; makra i cfg mają ustalone zasady |
| D-05 | Zamknięte: analiza → filter → prezentacja; explain według kontraktu CLI; wartości metryk i null nie zmieniają kolejności rekordów; kody zakończenia ustalone: 0 bez błędu, 1 przy błędzie; niedostępny pomiar ma null |
| D-06 | Zamknięte: analizujemy pliki wskazane wprost i dopasowane do przekazanych globów, bez dodatkowych filtrów i wyboru konfiguracji cfg. Pusta lista plików daje pusty raport i kod 0 |

## Pokrycie kryteriów akceptacji

1. Wspólny CLI: UC-01, UC-02.
2. Trzy metryki z regułami i testami: UC-04–UC-08 oraz testy jednostkowe.
3. Niezależność od formatowania: UC-06, UC-07.
4. Liczbowy Cyclomatic: UC-08, UC-09.
5. Niedostępny wynik jako null: UC-09, UC-10.
6. Lokalizacje: UC-04.
7. Zgodność formatów: UC-09.
8. Zachowanie plików bez pomiaru w wykazie i null bez opisu przyczyny: UC-10.
9. Brak edycji źródeł przez samą analizę: UC-12.
10. Rozszerzalność: UC-13.
11. Deterministyczność: UC-09, UC-11.

## Karta scenariusza i E2E

Każdy scenariusz opisuje wymaganie, potrzebę, poziom testu, źródło, czynność, oczekiwany wynik z ręcznym wyprowadzeniem, kontrast, kombinację konstrukcji i zależne decyzje. Wykonanie wymaga zapisania wersji kodu i wyniku.

Lokalny materiał: msfs2024-artificial-horizon, commit 3e8fd243938e80083e6629fe53d72591b2f1bbba. Małe przypadki mają pełne ręczne oczekiwania. Dla web/helpers.js, web/telemetry/validation.js i wybranych funkcji src/http/sse.rs należy rozpisać metryki oraz ograniczenia. Przygotowana lista plików repozytorium sprawdza zgodność zakresu z wejściem, zachowanie null, niezmienność źródeł i deterministyczność. Brak błędów parsowania nie dowodzi poprawności pełnych metryk.

Jeden przypadek zapisu w E2E: uruchomić CLI dla lokalnego materiału z --format json i --output wskazującym plik docelowy raportu. Oczekiwać kodu 0 i poprawnego raportu JSON w tym pliku, zgodnego z oczekiwanymi rekordami oraz licznikami całego raportu. To jeden planowany test zapisu; pozostałe przypadki sprawdzają treść formatów w ramach UC-09 i UC-15.


Dodatkowe oczekiwania: [tabele przypadków](code-complexity-metric-rules.md). If/else daje Cyclomatic 2 i Cognitive 2; if/else-if/else daje 3 i 3. Testować oddzielnie default JS, niepustą gałąź _ Rust, pustą gałąź Rust, guardy, ?, ??, ?. i catch/throw. Bez implementowania testów na etapie zapisu reguł.

Cognitive operatorów: te same oczekiwania dla Rust i JS według tabeli reguł. Sprawdzić &&/&& → 1, ||/|| → 1, &&/|| → 2 oraz ||/&&/|| → 3. Dodać nawiasy, odrębne argumenty i negację podwyrażenia. JS ?? ma 0 punktów Cognitive. Są to planowane przypadki, bez implementacji testów w tej zmianie.

## UC-14. Zgodność reguł między językami — test akceptacyjny

Status: zaplanowany, niewykonany. Dotyczy wszystkich trzech metryk i każdego obecnego oraz przyszłego języka.

Dla każdej wspieranej konstrukcji przygotować równoważne źródła w językach, które ją posiadają, i wspólny ręcznie obliczony wynik. Uruchomić publiczny CLI i porównać wyniki outer obejmujące ich jednostki wewnętrzne. Każda metryka musi jednocześnie zgadzać się z oczekiwaniem i wynikiem pozostałych języków. Dwa zgodne null lub dwie zgodne błędne liczby nie zaliczają testu. Lokalizacje i nazwy funkcji mogą różnić się między źródłami.

Macierz obejmuje: puste funkcje, deklaratory i destrukturyzację, wywołania proste/zagnieżdżone/łańcuchowe, wywołania w deklaracji/return/warunku, if/else-if/else, pętle, logiczne sekwencje, wybór gałęzi z pustymi ciałami, funkcje zagnieżdżone oraz jawne i niejawne zwracanie. Porównywać konstrukcje o tej samej strukturze, bez sztucznego przepisywania składni nieobecnej w danym języku. Np. dodatkowy break w JS jest dodatkową instrukcją i musi mieć odpowiednik w porównaniu, albo porównanie tej pary nie obejmuje Statement Count.

Wspólne trójki (Cognitive, Statements, Cyclomatic): pusta funkcja (0,0,1), pojedyncze save(); (0,1,1), łańcuch dwóch wywołań (0,2,1), let x = load(); (0,2,1), return save(); (0,2,1), if z atomowym warunkiem i jednym save(); (1,2,2). Pozostałe oczekiwania wyprowadzić z tabel projektu przed implementacją testów; nie generować ich z wyniku analizatora.

Konstrukcje dostępne tylko w jednym języku mają własne testy z ręcznym oczekiwaniem. Brak odpowiednika zapisujemy w macierzy testów, a nie jako wyjątek zmieniający reguły metryki. UC-14 pokrywa kryterium akceptacji 12 oraz wzmacnia kryteria 2 i 10.

Przypadki makr: println!(), vec![] i tokio::select! {} jako samodzielne instrukcje mają po +1 Statements i +0 pozostałych metryk. Wnętrze z wywołaniami, warunkami i zagnieżdżonymi makrami nie dodaje punktów. Deklarator i makro dają 2; makro nie tworzy rekordu funkcji ani null. Sprawdzić trzy rodzaje nawiasów.

UC-02: przekazać jawnie plik testowy, plik z oznaczeniem generated, plik objęty .gitignore i plik z cfg. Każdy ma być analizowany. Sąsiedni plik niewskazany wprost i niedopasowany do globów nie pojawia się w raporcie. Zmiana samych oznaczeń test/generated/cfg nie usuwa funkcji z raportu. Brak możliwości odczytu lub parsowania nie powoduje cichego usunięcia pliku z wykazu.

Kody CLI — planowane kontrole: poprawne uruchomienie bez błędów kończy się kodem 0. Błąd argumentów, odczytu pliku, parsowania, ładowania parsera lub zapisu raportu kończy się kodem 1. Raport częściowy po błędzie nie zmienia kodu na 0.

Kolejność wyników — oczekiwania: rekordy mają stały porządek według ścieżki pliku, następnie pozycji outer w pliku. Dla rekordów w tym porządku wartości 3, null, 1, null, 0 pozostają w tej kolejności. Zmiana wartości metryk nie przestawia rekordów. Zero jest poprawną liczbą; null nie zamieniamy na zero. Przypadek uzupełnia UC-16.

Statement Count — dodatkowe oczekiwania: ; → 1, ;; → 2, save(); → 1, save();; → 2; JS x++/++x/x--/--x → po 1; Rust/JS x += 1 → 1; x += calculate() → 2; JS new Foo() → 1 i let x = new Foo(load()) → 3. Sprawdzić osobno puste ciało funkcji (0 instrukcji) i ciało z samym ; (1). Średniki w nagłówku for, komentarzach i stringach nie są pustymi instrukcjami. Te przypadki rozszerzają UC-06 i macierz UC-14 tam, gdzie składnia występuje. Nie pisać testu oczekującego obsługi ++ w Rust.

UC-04 i UC-14 — akceptacja outer: w obu językach przygotować outer z if, a w nim closure z dwoma zagnieżdżonymi if i jednym work();. Oczekiwać jednego rekordu outer: Cognitive 8, Statements 5 (trzy if, deklarator closure, work), Cyclomatic 4. Closure nie pojawia się osobno. Powtórzyć dla nazwanej funkcji wewnętrznej i kilku poziomów zagnieżdżenia, wyznaczając Statements zgodnie z rzeczywistymi deklaratorami. Sprawdzić przywrócenie głębokości po wyjściu z funkcji wewnętrznej, brak mnożenia ciała przez liczbę wywołań i obecność pomiaru niewywoływanej funkcji wewnętrznej. Liczba funkcji w podsumowaniu dotyczy outer, nie wszystkich węzłów funkcji parsera.

Zatwierdzone przypadki Cognitive: match/switch z trzema prostymi gałęziami → 1; z if w jednej gałęzi → 3; pętla z if → 3; dodatkowy break z etykietą → 4. Weryfikować catch i ?: na poziomie outer (+1) i w ciele if (+2 za samą konstrukcję), przywracanie głębokości, brak punktów za zwykłe skoki, return, throw, ?, ?. i wywołania. Używać wspólnych oczekiwań UC-14 tam, gdzie konstrukcje mają odpowiedniki.

UC-10: dla listy poprawny/uszkodzony/poprawny plik sprawdzić przetworzenie obu poprawnych plików, obecność uszkodzonego w analyzed_files z językiem według rozszerzenia, brak jakichkolwiek rekordów jego funkcji i końcowy kod 1. Uszkodzony plik ma zawierać poprawnie wyglądającą funkcję przed błędem, aby potwierdzić odrzucenie również częściowo poprawnego drzewa. Summary.files wynosi 3; liczniki funkcji obejmują tylko outer dwóch poprawnych plików (prezentowanych po filtrze). Powtórzyć z błędem odczytu pojedynczego pliku. Pusta lista → poprawny pusty raport, zero plików i funkcji, kod 0. Błędny argument CLI pozostaje błędem z kodem 1, a nie pustym wejściem. Są to planowane testy, nie wyniki wykonania.

UC-02 — globy i rozpoznawanie języka: *.rs i *.js obejmują tylko dany katalog; **/*.rs obejmuje katalog bazowy i podkatalogi. Mieszane pliki i wzorce w jednym uruchomieniu dobierają właściwy parser dla każdego rozszerzenia i podają język w rekordach raportu. Nakładające się wzorce oraz ścieżka dosłowna do tego samego pliku nie podwajają rekordów ani pomiarów. Kolejność argumentów nie zmienia pomiarów. Sprawdzić cytowane ścieżki ze spacjami i Unicode, pliki testowe/generowane/objęte .gitignore oraz brak dodatkowych wykluczeń. Glob bez dopasowań daje pusty zakres, brak dosłownie wskazanego pliku jest błędem. Nieobsługiwane rozszerzenie pozostaje w analyzed_files z language: null i daje kod 1; nie tworzy rekordów funkcji. Brak parametru wyboru języka; jeden raport może zawierać Rust i JavaScript.

## UC-15. Wyjaśnienie pomiaru przy kodzie

Status: zaplanowany, niewykonany. Uruchomić CLI dla tych samych plików bez --explain (JSON i Markdown) oraz z --explain (zawsze Markdown). Wyniki metryk i kody zakończenia muszą być identyczne. Bez flagi brak szczegółów liniowych; z flagą wszystkie trzy metryki mają dane liniowe. Sprawdzić --explain bez --format, z --format markdown oraz z --format json w obu kolejnościach argumentów: wynik zawsze jest Markdown. Zwykły raport JSON nie zawiera pola explanation. Suma przyrostów każdej dostępnej metryki jest dokładnie równa wynikowi outer.

Przypadek process — deklarator inner znajduje się w ciele zewnętrznego if:

```javascript
function process(a) {
    if (a) {
        const inner = () => {
            if (ready()) {
                save();
            }
        };
    }
}
```

Oczekujemy jednego rekordu process, bez osobnego rekordu inner:

- Cognitive 4: zewnętrzny if +1; wewnętrzny if +3 (poziom zewnętrznego if oraz dodatkowy poziom closure).
- Cyclomatic 3: jedna baza outer +1 i dwa if po +1.
- Statements 5: dwa if, deklarator inner, wywołanie ready() i wywołanie save(), każde po +1. Closure nie dodaje osobnego punktu ponad deklarator.

W explain linia if (ready()) ma przyrosty Cognitive +3, Cyclomatic +1 i Statements +2. Baza Cyclomatic +1 przypada na początek outer. Pokazać także linie bez przyrostów i sumy outer zgodnie z kontraktem explain.


Sprawdzić kilka konstrukcji w jednej linii, konstrukcję wielowierszową, łańcuch wywołań, komentarze, puste linie, Unicode, wcięcia, CRLF/LF i znaki |, || oraz backticki w źródle. Markdown usuwa oryginalne komentarze liniowe, blokowe i dokumentacyjne z kopii kodu i dodaje komentarze // z przyrostami trzech metryk, nazwami reguł oraz sumami. Sprawdzić zachowanie podziałów linii i rozdzielenia tokenów przy usuwaniu komentarzy. Literały ze znakami //, /* i */ pozostają niezmienione, także raw strings, regexy JS i template literals. Komentarze kodu wewnątrz interpolacji są usuwane. Punktacja linii wewnątrz wielowierszowego literału trafia do osobnego komentarza po nim z numerem linii, nigdy do treści literału. Wykorzystać odpowiedniki Rust/JS w UC-14.

Dla null nie wyświetlać przyczyny ani udawać kompletnego wyjaśnienia: wynik i przyrosty tej metryki w komentarzach pozostają null. Zweryfikować, że poprawne metryki nadal zachowują swoje wyjaśnienia. Makro pozostaje jednym naliczeniem Statements, bez naliczania jego wnętrza.

## UC-16. Filtr nazw outer

Status: zaplanowany, niewykonany. --filter "process|save" wybiera dokładnie te nazwy; processExtra oraz Process nie pasują. Testować nazwę zawierającą znak o specjalnym znaczeniu w regex, aby sprawdzić literalne porównanie. Dwa outer o nazwie process w różnych plikach oba pozostają. Samo inner jako nazwa funkcji wewnętrznej nie wybiera rekordów; wybrane outer zachowuje całość swoich metryk i kodu wewnętrznego.

Sprawdzić filtr z plikiem i globami, bez explain w JSON i Markdown oraz z explain wyłącznie w Markdown. Brak dopasowań daje puste zestawienie, ale nie ukrywa błędu analizy pliku. Brak --filter zachowuje wszystkie outer. Nazwa powtórzona w liście nie powiela rekordu.

Przypadek kompletności: przygotować ponad 10 pasujących outer o różnych wartościach metryk, również null, oraz rekord niepasujący o najwyższym wyniku. Raport zawiera wszystkie pasujące outer, bez niepasującego. Kolejność wyznacza ścieżka pliku i pozycja funkcji; zmiana wartości metryki lub null nie przesuwa rekordu. Podsumowanie ujawnia liczbę znalezionych i prezentowanych outer. Explain dotyczy dokładnie tych samych rekordów co raport bez explain po zastosowaniu filtra.

UC-15 i UC-16 rozszerzają kryteria akceptacji 7, 9 i 11; UC-15 także UC-14 dla zgodności języków. Są to plany testów, bez nowej implementacji testów w tej zmianie.

UC-06 i UC-14 — samodzielne wyrażenia: w Rust i JavaScript x;, 42; oraz x + 1; mają po 1 Statement Count; funkcja zawierająca kolejno te trzy instrukcje ma wynik 3. Sprawdzić brak podwajania wrappera: save(); → 1, łańcuch dwóch metod → 2, x = 3; → 1, a w JavaScript x++; → 1. Operandy x + 1 nie dostają osobnych punktów. Przypadki są zaplanowane, bez implementowania testów.

UC-06 — końcowe if/match w Rust: przykłady choose i choose_match z reguł metryk mają Statement Count 3 (konstrukcja + dwa niejawne zwroty stałych). Warianty z first()/second() w gałęziach mają 5. Sprawdzić jawne return z tymi samymi wynikami, zagnieżdżone if/match bez dodatkowego zwrotu całej konstrukcji oraz brak punktu za else i samo oznaczenie ramienia. W UC-14 porównać odpowiedniki z jawnymi return w JavaScript tam, gdzie struktura jest równoważna. W UC-15 przykład choose ma sumy Cognitive 2, Cyclomatic 2, Statements 3 i komentarze zgodne z kontraktem explain. Są to przypadki planowane, nie wykonane testy.

UC-06 — if/match jako inicjalizator Rust: let x = if b { 1 } else { 2 }; oraz let x = match b { true => 1, false => 2 }; mają po 4 Statements (deklarator 1, konstrukcja 1, dwie wartości gałęzi 2). Warianty z first()/second() mają po 6. Porównać z końcowymi if/match bez deklaratora: odpowiednio 3 i 5; jedyną różnicą jest deklarator +1. Sprawdzić zapis jedno- i wielowierszowy oraz brak dodatkowego punktu za przekazanie całego wyniku do zmiennej. W UC-15 suma przyrostów wyjaśnienia musi wynosić odpowiednio 4 i 6. Są to planowane przypadki, nie wykonane testy.

UC-05, UC-14 i UC-15 — głębokość Cognitive w warunku: JS if (a ? b : c) {} daje 2 (if 1, ternary 1); if (a) { use(b ? c : a); } daje 3 (if 1, ternary 2, wywołanie 0). Wykorzystać pełne funkcje condition i body z reguł metryk. Sprawdzić zachowanie bieżącej głębokości w warunkach i innych podwyrażeniach nagłówków oraz jej wzrost w ciałach/gałęziach. Konstrukcje w nagłówku nadal są liczone, a closures zachowują własny przyrost głębokości. Porównać odpowiedniki Rust/JS tam, gdzie dana składnia występuje; nie wymagać operatora ?: w Rust. Explain ma te same sumy i przyrosty co wynik metryki. Są to przypadki planowane, bez implementowania testów.

UC-06, UC-14 i UC-15 — Statement Count operatora ?: w JavaScript: const x = b ? 1 : 2; daje 4 (deklarator 1, wybór 1, dwie wartości gałęzi 2), a const x = b ? first() : second(); daje 6 (dodatkowo dwa wywołania). Porównać z inicjalizatorami if w Rust o tej samej strukturze: wyniki odpowiednio 4 i 6. Sprawdzić brak dodatkowego punktu za wrapper lub przekazanie całego wyniku do zmiennej oraz niezależność od zapisu jedno- i wielowierszowego. Suma przyrostów Statements w explain musi odpowiadać wynikowi metryki. Są to przypadki planowane, nie wykonane testy.

UC-04, UC-06 i UC-14 — definicje funkcji zagnieżdżonych: JS function outer() { function inner() {} } i Rust fn outer() { fn inner() {} } mają jeden rekord outer, Statements 1, Cognitive 0, Cyclomatic 1. Puste outer bez inner ma Statements 0. Wariant const inner = () => {}; oraz Rust let inner = || {}; w outer ma Statements 1 za deklarator, bez dodatkowego punktu za closure. Dwie nazwane definicje zagnieżdżone na kolejnych poziomach dają łącznie Statements 2 do jednego outer. Dodanie save(); do ciała inner zwiększa Statements outer o 1, bez mnożenia przez liczbę wywołań. Przypadki są zaplanowane, nie wykonane.

UC-06, UC-14 i UC-15 — dodatkowe bloki: puste outer → Statements 0; outer z jednym pustym blokiem wewnątrz → 1 w Rust i JavaScript. Jeden dodatkowy blok z work(); → 2 w obu językach. Rust fn example() -> i32 { { { { 1 } } } } → Statements 4 (trzy dodatkowe bloki i jedno niejawne zwrócenie); let result = { prepare(); calculate() }; → 5. Przyrost za blok przypisujemy do jego początku w explain; sumy muszą zgadzać się z pomiarem. Sprawdzić, że bezpośrednie ciała funkcji, closures, pętli, gałęzi if/match/switch i try/catch/finally nie dodają osobnego punktu, natomiast kolejny blok wewnątrz dodaje 1. Obiekty, struktury, importy, destrukturyzacja i literały nie otrzymują punktów za klamry. Wnętrza makr pozostają pomijane. Same dodatkowe bloki nie zmieniają Cognitive ani Cyclomatic. Przekazywanie końcowej wartości przez kolejne bloki nie mnoży niejawnych zwrotów; blok bez końcowego wyrażenia nie dodaje zwrotu unit. Dotychczasowe przykłady końcowego if/match (3/5) i inicjalizatorów (4/6) zachowują wyniki. Są to planowane przypadki, nie wykonane testy.

UC-04 i UC-06 — funkcja jako wartość deklaratora: wewnątrz outer każdy wariant const f = () => {};, const f = function() {}; i const f = function named() {}; daje Statements 1. Umieszczenie trzech deklaratorów a/b/c w jednym outer daje 3, jak w przykładzie reguł. Nazwa function expression nie dodaje punktu. Osobna deklaracja function named() {} wewnątrz outer daje 1 za deklarację. Dodanie save(); do ciała każdego wariantu podnosi wynik outer o 1; brak osobnego rekordu funkcji zagnieżdżonej. UC-14 porównuje wariant arrow z Rust let f = || {}; (Statements 1). Są to przypadki planowane, nie wykonane testy.

UC-06 i UC-14 — wiązania wzorców: Rust if let Some(value) = item { consume(value); } → Statements 3; while let Some(value) = next() { consume(value); } → 4; for value in values { consume(value); } → 3; for (key, value) in pairs {} → 2. Przypadki umieścić w ciałach funkcji. Wspólny wzorzec daje jeden punkt wiązania bez względu na liczbę nazw; let nie jest liczony ponownie ponad wiązanie. Porównać pętlę Rust z JS for (const value of values) { consume(value); } → 3 oraz destrukturyzację z JS for (const [key, value] of pairs) {} → 2. Nie doliczać niejawnych wywołań iteracji ani przyrostów Cognitive/Cyclomatic za samo wiązanie. UC-15 sprawdza zgodność sum i lokalizacji przyrostów z regułą początku konstrukcji. Są to przypadki planowane, nie wykonane testy.

UC-04, UC-06 i UC-15 — definicja macro_rules! wewnątrz outer: samo makro bez wywołania daje Statements 1, Cognitive 0, Cyclomatic 1 (baza outer). Definicja answer i jedno answer!(); z przykładu reguł dają Statements 2, Cognitive 0, Cyclomatic 1. Zmiana liczby ramion i dodanie do szablonu wywołań, decyzji, bloków lub funkcji nie zmienia wyniku: całe wnętrze definicji jest pomijane. Nie tworzyć osobnego rekordu makra. Definicja na poziomie modułu nie tworzy rekordu funkcji ani nie zwiększa metryk sąsiednich outer. Explain przypisuje +1 Statement do początku definicji, bez przyrostów za jej wnętrze. Są to przypadki planowane, nie wykonane testy.

UC-06 — zastosowanie ogólnych reguł do gałęzi: pełny przykład branches z reguł metryk ma Statements 5 (dwa if i trzy wywołania); else nie dodaje punktu. Pełny przykład choice ma 4 (switch, first(), break, second()); case i default nie dodają punktów za etykiety. Fragment catch (error) { recover(); } w poprawnym try/catch wnosi 2 Statements: catch i wywołanie. Sprawdzić przyrost fragmentu względem tej samej konstrukcji z pustym ciałem catch (różnica +1 za recover), nie utożsamiać fragmentu z całym wynikiem funkcji. Wywołania w warunkach i gałęziach podlegają zwykłej regule +1. UC-14 porównuje łańcuch if/else if/else Rust i JavaScript o tej samej strukturze; nie wymaga catch ani switch w Rust. UC-15 sprawdza przyrosty i sumy Statements tych przykładów. Są to przypadki planowane, nie wykonane testy.

UC-04, UC-09 i UC-16 — nazwy outer: function process() {} → name "process"; const save = () => {}; → "save"; const load = function() {}; → "load"; export default () => {}; → null. Własna nazwa funkcji ma pierwszeństwo przed nazwą zmiennej. Każdy rekord zachowuje identyfikator lokalizacyjny. Bez filtra uwzględnić outer z name: null; filtr "process|save" wybiera tylko te nazwy. Name: null nie pasuje do filtra, także wartości tekstowej "null", ani nie jest zastępowane sztuczną nazwą. JSON zapisuje null jako null, a Markdown nie przedstawia go jako nazwy funkcji. Są to przypadki planowane, nie wykonane testy.

UC-02, UC-09 i UC-10 — nieobsługiwane rozszerzenie: przekazać istniejący plik example.xyz oraz poprawny plik .rs lub .js. Example.xyz pozostaje w analyzed_files z language: null, bez rekordów funkcji i opisów przyczyn. Poprawny plik nadal jest analizowany. Summary.files uwzględnia oba pliki; functions_found i functions_presented obejmują wyłącznie rozpoznane outer poprawnego pliku, z uwzględnieniem filtra dla prezentowanych. Końcowy kod wynosi 1. Sam plik .xyz daje jeden plik i zero funkcji. JSON zachowuje null, Markdown nie przypisuje plikowi wymyślonego języka. Są to przypadki planowane, nie wykonane testy.
