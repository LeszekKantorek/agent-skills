# Plan pracy: Code Complexity Metrics

Cel: trzy metryki składniowe funkcji i metod Rust/JavaScript: Cognitive Complexity, Statement Count i Cyclomatic Complexity. Moduły .mjs uruchamiane w Node, bez kompilacji. Praca lokalna na code-complexity-metrics, bez push.

## 1. Domknąć reguły

- Wersjonować profil Cognitive oparty na SonarSource, bez składnika rekurencji; stosować ustalone wliczanie closures do outer i sekwencje logiczne; stosować zatwierdzone reguły skoków, pętli i wyboru gałęzi. Warunki i podwyrażenia nagłówków zachowują bieżącą głębokość Cognitive; ciała i gałęzie zwiększają ją zgodnie z regułami konstrukcji.
- Zaimplementować ustalone reguły Statement Count: każde wywołanie +1, samodzielne wyrażenia +1 bez podwajania już policzonych instrukcji, deklaratory, dodatkowe bloki +1 (bez punktu za bezpośrednie ciała konstrukcji) i niejawne zwrócenia bez mnożenia przez otaczające bloki według tabeli projektu, w tym końcowe if/match i if/match jako inicjalizatory: konstrukcja +1 i zwroty gałęzi, bez dodatkowego zwrotu całej konstrukcji; inicjalizator ma dodatkowo +1 za deklarator. Operator ?: w JavaScript stosuje tę samą regułę wyboru i wartości gałęzi co if zwracający wartość w Rust. Wiązanie wzorca w Rust if let, while let i for dodaje 1 Statement, niezależnie od liczby nazw w jednym wzorcu, bez ponownego doliczenia let.
- Zaimplementować zatwierdzone [tabele Cyclomatic i reguły else](code-complexity-metric-rules.md); sprawdzić wspólne reguły pustych funkcji i gałęzi.
- Zastosować ustaloną regułę makra: wywołanie +1 Statement, definicja macro_rules! wewnątrz outer +1 Statement, bez analizowania ich wnętrz i bez osobnych rekordów; analizować zapisany kod bez filtrowania przez cfg i oznaczenia kodu generowanego.
- Zaimplementować kody CLI: 0 bez błędu, 1 przy błędzie.

Kryterium: każda wspierana konstrukcja ma regułę i ręcznie wyznaczony przykład; ograniczenia są opisane w dokumentacji.

## 2. Szkielet i kontrakt

- Utworzyć strukturę z architektury, jeden CLI, przyjmowanie plików i globów, rozpoznawanie języka po rozszerzeniu i ładowanie parserów względem skilla.
- Zdefiniować minimalny model składni, lokalizacyjne identyfikatory i schemat raportu, oraz wewnętrzny model przyrostów i linii źródła do explain w Markdown; bez pola explanation w JSON.
- Obsłużyć --explain i --filter już w kontrakcie argumentów CLI; pełne zasady i przykłady określa sekcja „Explain i filtrowanie wyników” w [wymaganiach](code-complexity-prompt.md).
- Obsłużyć błędy wejścia, odczytu i parsera. Nie wykorzystywać częściowo poprawnego drzewa: błąd parsowania lub odczytu oznacza wpis pliku z językiem według rozszerzenia w analyzed_files, bez rekordów funkcji, z przyrostem tylko licznika plików; kontynuować pozostałe pliki i zakończyć kodem 1 bez opisu przyczyny. Nieobsługiwane rozszerzenie zachować w analyzed_files z language: null, bez rekordów funkcji; kontynuować pozostałe pliki i zakończyć kodem 1.

Kryterium: pliki wskazane wprost lub dopasowane do przekazanych globów analizowane z dowolnego cwd, bez edycji źródeł przez samą analizę.

## 3. Adaptery i trzy metryki

- Wyodrębnić outer i przypisać mu wszystkie funkcje wewnętrzne oraz closures. Ustalać name z nazwy funkcji, następnie nazwy zmiennej, a przy braku obu zwracać null; filtr nazw nie dopasowuje name: null. Nie generować dla jednostek wewnętrznych osobnych wyników.
- Mapować składnię Rust/JS bez podwójnego liczenia wrapperów. Stosować reguły ogólne Statement Count także do else if (+1 za if), catch (+1) i switch (+1), bez punktów za etykiety case/default i samo else. Samodzielna deklaracja nazwanej funkcji zagnieżdżonej dodaje 1 Statement do outer; deklarator z funkcją (arrow, anonimowe lub nazwane function expression, closure) nie otrzymuje drugiego punktu za samą funkcję, a definicja outer nie dodaje punktu.
- Zaimplementować trzy liczniki według wersjonowanych reguł. Emitować przyrosty z lokalizacjami jako wspólne źródło sum i explain; nie tworzyć osobnego algorytmu pomiaru dla explain.
- Odwiedzać decyzje również w argumentach, inicjalizatorach i interpolacjach.
- Zwracać null dla niedostępnych pomiarów, bez statusu i opisu przyczyny, także w explain. Null nie zastępuje implementacji konstrukcji wymaganych przez uzgodnione reguły.

Kryterium: oczekiwane wartości małych przykładów i ich kompozycji, niezależne od formatowania. Bez rozpoznawania celów wywołań.

## 4. Raport i E2E

- JSON i Markdown z jednego modelu, z metrykami outer i wyłącznie licznikami całego raportu files, functions_found, functions_presented; filtr dokładnych nazw outer, wszystkie pasujące wyniki i lokalizacje; stała kolejność ścieżki pliku i pozycji funkcji, niezależna od wartości metryk oraz null.
- Zaimplementować --explain z tych samych przyrostów co sumy metryk; usunąć istniejące komentarze w kopii do raportu i dodać komentarze z punktacją wszystkich trzech metryk oraz sumami. Użyć zakresów parsera, zachować literały. Explain zawsze zwraca Markdown, także przy --format json.
- Zweryfikować UC-15 i UC-16: zgodność sum explain, zamianę komentarzy w raporcie oraz kolejność analiza → filter → prezentacja wszystkich pasujących outer.
- Ręcznie rozpisać trzy metryki wybranych funkcji z web/helpers.js, web/telemetry/validation.js i src/http/sse.rs.
- Uruchomić CLI na lokalnej kopii msfs2024-artificial-horizon, commit 3e8fd243938e80083e6629fe53d72591b2f1bbba. W jednym przypadku E2E sprawdzić zapis raportu JSON do pliku docelowego wskazanego przez --output.
- Zweryfikować deterministyczność, brak zmian źródeł, błędne i puste wejście oraz brak niezamówionej selekcji plików.

Kryterium: sprawdzone wartości liczbowe i null; sam poprawny parser nie wystarcza.

## 5. Dostarczenie

- Napisać SKILL.md i opis ograniczeń.
- Wymagać Node 24 LTS jako minimalnej wspieranej linii. Dołączyć do Git runtime JS/WASM i gramatyki Rust/JS w vendor/tree-sitter/, z licencjami i manifestem wersji, pochodzenia oraz hashów.
- Zweryfikować pierwsze i kolejne uruchomienie z czystej kopii skilla, offline, z samym Node, bez npm install i kompilacji.
- Sprawdzić deklarowane platformy i kryteria akceptacji wymagań.

Kryterium: użytkownik nie potrzebuje kompilatora ani TypeScript.

## Stan

Prototyp complexity-spike działa na ograniczonym podzbiorze. Plan pełnej weryfikacji znajduje się w code-complexity-verification-plan.md. Plan nie oznacza implementacji pełnego skilla ani ukończenia jego testów.


Cognitive: sekwencje && oraz || liczymy identycznie w Rust i JavaScript (+1 za pierwszą sekwencję i każdą zmianę operatora), zgodnie z [regułami metryk](code-complexity-metric-rules.md). JS ?? nie dodaje punktów Cognitive.

Warunek odbioru wszystkich liczników: UC-14 sprawdza identyczne wyniki równoważnych konstrukcji między językami, dla każdej metryki.
