# Code Complexity Metrics — wizja i założenia skilla

## 1. Cel

Zbudować wielojęzyczny skill `code-complexity-metrics`, który automatycznie mierzy złożoność kodu źródłowego za pomocą trzech wybranych metryk:

1. **Cognitive Complexity** — trudność zrozumienia przepływu sterowania.
2. **Statement Count** — rozmiar funkcji mierzony liczbą instrukcji i operacji.
3. **Cyclomatic Complexity** — złożoność cyklomatyczna według reguł projektu dla JavaScript i Rust.

Celem jest identyfikowanie funkcji i metod, które mogą wymagać dokładniejszego Code Review lub refaktoryzacji.

Szczególnie zależy nam na wykrywaniu problemów często występujących w kodzie generowanym przez agentów AI:

- Zbyt rozbudowanych funkcji.
- Nadmiernie skomplikowanego przepływu sterowania.
- Wielu punktów decyzyjnych w jednej funkcji.
- Wzrostu złożoności w kolejnych wersjach implementacji.

Skill **mierzy, nie ocenia architektury**. Nie powinien automatycznie stwierdzać, że kod jest źle zaprojektowany, ani proponować refaktoryzacji wyłącznie na podstawie przekroczenia progu.

Wyniki mają dostarczać obiektywnych danych, które mogą zostać wykorzystane przez programistę lub osobny skill Code Review.

## 2. Obsługiwane języki

Pierwsza wersja:

- Rust
- JavaScript

Planowane rozszerzenia:

- TypeScript
- C#
- Inne języki według potrzeb

Każdy język otrzymuje adapter składni w `scripts/languages/`, napisany jako moduł JavaScript `.mjs`. Liczniki metryk są wspólne dla języków.

Adaptery językowe korzystają z parsera Tree-sitter i udostępniają wspólny model składni licznikom metryk.

Dodanie języka nie może wymagać przebudowy mechanizmu raportowania ani zmiany definicji metryk dla pozostałych języków.

## 3. Struktura skilla

```text
skills/code-complexity-metrics/
  SKILL.md
  package.json
  package-lock.json
  references/
    metric-rules.md
    report-schema.json
    limitations.md
  vendor/
    tree-sitter/    # runtime JS/WASM, gramatyki Rust/JS, licencje i manifest
  scripts/
    measure.mjs
    input-files.mjs
    parser.mjs
    ir.mjs
    languages/
      rust.mjs
      javascript.mjs
    metrics/
      cognitive.mjs
      statements.mjs
      cyclomatic.mjs
    report.mjs
  tests/
    fixtures/
      rust/
      javascript/
    metrics.test.mjs
    cli.test.mjs
    e2e.test.mjs
```

Struktura jest zgodna z [architekturą](code-complexity-architecture.md). Pierwsza wersja zawiera adaptery Rust i JavaScript oraz wspólne liczniki trzech metryk. Jedynym publicznym punktem wejścia jest `scripts/measure.mjs`.

Nie tworzymy pustych implementacji dla przyszłych języków.

### 3.1. SKILL.md

Definiuje:

- Cel i zakres skilla.
- Kiedy agent powinien go uruchomić.
- Obsługiwane języki.
- Sposób uruchomienia analizatora.
- Opis metryk i ograniczeń.
- Strukturę raportu.
- Interpretację wyników.

Analizator przyjmuje pliki i wzorce glob przez powtarzalny --path. Użytkownik lub LLM określa zakres; analizator rozwija tylko podane wzorce i rozpoznaje język każdego pliku po rozszerzeniu.

### 3.2. measure.mjs — główny punkt wejścia

Odpowiada za:

- Parsowanie argumentów CLI.
- Wybór implementacji językowej dla każdego pliku po rozszerzeniu: .rs → Rust, .js → JavaScript.
- Rozwinięcie przekazanych globów i odczyt wskazanych plików, bez własnych wykluczeń.
- Uruchamianie odpowiedniego analizatora.
- Walidowanie otrzymanych wyników.
- Zebranie wyników outer i liczników całego raportu.
- Generowanie jednolitego raportu.
- Zwracanie null dla niedostępnych pomiarów.

Nie powinien sam implementować reguł specyficznych dla Rust lub JavaScript.

### 3.3. Adaptery językowe i wspólne liczniki

`scripts/parser.mjs` ładuje runtime oraz gramatyki Tree-sitter z `vendor/tree-sitter/` i parsuje kod. Adaptery `scripts/languages/rust.mjs` i `scripts/languages/javascript.mjs`:

- Identyfikują outer oraz jego funkcje wewnętrzne, metody i closures.
- Rozpoznają konstrukcje języka, ich lokalizacje i zagnieżdżenie.
- Mapują składnię na wspólny model z `scripts/ir.mjs`.

Wspólne moduły `scripts/metrics/cognitive.mjs`, `statements.mjs` i `cyclomatic.mjs` obliczają metryki outer oraz przyrosty używane przez explain. Adaptery nie tworzą odrębnych, językowych definicji punktacji. `scripts/report.mjs` prezentuje wyniki zgodnie z kontraktem CLI.

Korzystamy z Tree-sitter WASM z gramatykami Rust i JavaScript, bez własnego parsera i bez zastępowania parsowania wyrażeniami regularnymi.

## 4. Metryki

### 4.1. Cognitive Complexity

**Pytanie:** Jak trudno zrozumieć przepływ sterowania w funkcji?

Metryka uwzględnia m.in.:

- Rozgałęzienia warunkowe.
- Pętle.
- Zagnieżdżenia.
- Wybrane operatory logiczne.
- Konstrukcje przerywające lub komplikujące liniowy przepływ sterowania.

Przykład A:

```rust
if a { action_a(); }
if b { action_b(); }
if c { action_c(); }
```

Cognitive Complexity = 3.

Przykład B:

```rust
if a {
    if b {
        if c {
            action();
        }
    }
}
```

Cognitive Complexity = 6.

Obie implementacje mają trzy warunki, ale druga wymaga śledzenia głębszego zagnieżdżenia.

**Wynik:** nieujemna liczba całkowita przypisana do funkcji.

**Wymagania implementacyjne:**

- Oprzeć reguły na uznanej definicji SonarSource Cognitive Complexity.
- Uwzględnić konstrukcje charakterystyczne dla danego języka, np. `match` w Rust i `switch` w JavaScript.
- Nie traktować wszystkich klamer jako zagnieżdżeń sterowania.
- Zachować porównywalną interpretację metryki między językami.
- Udokumentować przyjęte reguły dla konstrukcji specyficznych dla języka.

Profil składniowy bazuje na SonarSource, ale pomija premię za rekurencję bezpośrednią i pośrednią. Nie rozpoznajemy celów wywołań ani cykli. Profil musi mieć własną wersję i jawnie opisywać tę różnicę; nie deklarujemy pełnej zgodności z SonarSource.

Zwykłe else dodaje +1 do Cognitive, lecz +0 do Cyclomatic. Szczegóły if/else-if i przykłady: [reguły metryk](code-complexity-metric-rules.md).

Zatwierdzona punktacja pętli, match/switch, catch, ?: i skoków znajduje się w [regułach metryk](code-complexity-metric-rules.md). Obowiązuje jednakowo we wszystkich językach posiadających daną konstrukcję.

### 4.2. Statement Count

**Pytanie:** Jak dużo operacji znajduje się w funkcji?

Metryka mierzy rozmiar implementacji na poziomie konstrukcji składniowych, a nie fizycznych linii kodu.

Przykład:

```rust
fn process() {
    validate(); save(); notify();
}
```

oraz:

```rust
fn process() {
    validate();
    save();
    notify();
}
```

Obie funkcje powinny otrzymać ten sam wynik.

**Wynik:** nieujemna liczba całkowita.

**Wymagania implementacyjne:**

- Liczyć na podstawie AST.
- Uwzględniać deklaracje, instrukcje sterujące, wyrażenia wykonywane jako instrukcje, przypisania (także złożone), inkrementację/dekrementację, puste instrukcje i jawne zakończenia funkcji. Samodzielne ; i x++ dodają po 1; zwykły terminator średnikowy nie dodaje punktu. Jawne new Foo() liczymy jak wywołanie.
- Uwzględnić końcowe wyrażenia zwracające wartość w Rust, bez mnożenia zwrotu przez otaczające bloki.
- Liczyć dodatkowe bloki kodu jako +1 Statement, z wyłączeniem bezpośrednich ciał funkcji i konstrukcji określonych w regułach metryk.
- Każde jawne wywołanie liczyć dodatkowo względem deklaratora, przypisania lub return. Nie doliczać wrappera instrukcji wyrażeniowej do już policzonego wywołania.
- Nie liczyć każdej operacji arytmetycznej lub każdego tokenu jako osobnej instrukcji.
- Nie uzależniać wyniku od formatowania, komentarzy ani pustych linii.

W Rust szczególnej uwagi wymagają wyrażenia blokowe, łańcuchy metod, `match`, closures i końcowe wyrażenia bez średnika.

W JavaScript należy odpowiednio traktować arrow functions, expression statements, deklaracje oraz metody.

Obowiązują wspólne zasady i przykłady Statement Count w [regułach metryk](code-complexity-metric-rules.md); należy utrwalić je testami. Nie wystarczy zliczenie węzłów AST nazwanych `statement`, jeżeli pomijałoby istotne konstrukcje jednego z języków.

Statement Count nie jest zamiennikiem Cognitive Complexity: duża funkcja może mieć prosty przepływ sterowania.

### 4.3. Cyclomatic Complexity

Obowiązują [uzgodnione reguły](code-complexity-metric-rules.md): punktacja projektu dla JavaScript i Rust, z jednym wynikiem outer obejmującym wszystkie funkcje wewnętrzne i closures. Równoważne konstrukcje w obu językach muszą mieć identyczną punktację każdej metryki. Wnętrze każdej zagnieżdżonej jednostki zwiększa wynik outer.

Wynik to nieujemna liczba całkowita w JSON (cyclomatic_complexity). Każde raportowane outer, również puste, ma bazowe 1 w obu językach; nie dodajemy kolejnych baz za funkcje wewnętrzne. Niedostępny pomiar ma wyłącznie null.

Trzy płaskie lub zagnieżdżone if dają 4; 4/8/64 if dają 5/9/65. Zagnieżdżenie nie dodaje osobnego kosztu. Zwykłe else dodaje 0. Pozostałe konstrukcje liczymy według tabel językowych w dokumencie reguł, bez badania osiągalności.

Nie enumerujemy kombinacji wykonania. Metryka nie jest automatycznie wymaganą liczbą testów ani oceną jakości architektury.

## 5. Wspólny kontrakt analizatorów

Wspólne liczniki zwracają wyniki w tej samej strukturze logicznej dla obu adapterów językowych.

Jednostką raportowania wszystkich trzech metryk jest outer wraz z całym kodem jego funkcji wewnętrznych i closures. Wewnętrzne jednostki nie mają osobnych rekordów.

Dla każdej funkcji potrzebujemy:

- Języka programowania.
- Ścieżki pliku.
- Nazwy i identyfikatora funkcji.
- Zakresu linii źródłowych.
- Cognitive Complexity.
- Statement Count.
- Cyclomatic Complexity.
- Wartości null zamiast niedostępnych pomiarów, bez dodatkowych pól opisowych.

Raport zawiera rekordy outer z ich metrykami oraz liczniki całego raportu: files, functions_found i functions_presented.

Nazwę outer ustalamy kolejno: własna nazwa funkcji; przy jej braku nazwa zmiennej, do której funkcja jest przypisana; przy braku obu name ma wartość null. Nie tworzymy sztucznych nazw. Identyfikator lokalizacyjny pozostaje dostępny również dla name: null.

```javascript
function process() {}       // name: "process"
const save = () => {};       // name: "save"
const load = function() {};  // name: "load"
export default () => {};    // name: null
```

Outer z name: null jest prezentowane bez --filter, ale nie pasuje do filtra nazw. --filter porównuje wyłącznie rzeczywiste wartości name, nie identyfikator ani tekst "null". Anonimowe jednostki będące outer otrzymują identyfikatory lokalizacyjne. Anonimowe jednostki wewnątrz innej funkcji są wliczane do outer i nie otrzymują osobnych rekordów raportu.

### Ważna zasada

Wszystkie języki muszą zwracać te same pola, ale **nie wolno wymuszać pozornej dokładności**.


Wynik Cyclomatic Complexity powinien być liczbą całkowitą w JSON; niedostępnego pomiaru nie zastępujemy zerem.

## 6. Jednolity raport

`measure.mjs` generuje raport o jednakowej strukturze niezależnie od języka.

Podstawowym formatem maszynowym jest JSON. Dodatkowo można wygenerować Markdown do przeglądania przez człowieka lub agenta.

Oba formaty muszą przedstawiać te same pomiary.

Przykładowa struktura JSON dla --path "./src/runtime.rs" --filter "process_events" --format json. Liczby metryk i wersje są ilustracyjne, nie są wynikiem wykonanej analizy. W pliku znaleziono dwa outer: process_events oraz calculate_speed. Filtr wybiera process_events; poniższa tablica functions zawiera wszystkie prezentowane rekordy, nie jest skrótem.

```json
{
  "schema_version": "1.0",
  "rules_version": "1.0",
  "analyzer_version": "0.1.0",
  "parser": {
    "package": "@vscode/tree-sitter-wasm",
    "version": "0.3.1"
  },
  "analyzed_files": [
    {
      "file": "src/runtime.rs",
      "language": "rust"
    }
  ],
  "summary": {
    "files": 1,
    "functions_found": 2,
    "functions_presented": 1
  },
  "functions": [
    {
      "id": "src/runtime.rs:120:1",
      "name": "process_events",
      "language": "rust",
      "file": "src/runtime.rs",
      "start_line": 120,
      "start_column": 1,
      "end_line": 240,
      "metrics": {
        "cognitive_complexity": 22,
        "statement_count": 78,
        "cyclomatic_complexity": 12
      }
    }
  ]
}
```

summary.files oznacza liczbę analizowanych plików. summary.functions_found to liczba znalezionych outer przed filtrem, a summary.functions_presented to liczba rekordów po filtrze, równa długości tablicy functions. Bez filtra oba liczniki funkcji są równe. Identyfikator w przykładzie łączy ścieżkę pliku z linią i kolumną początku outer; numery linii i kolumn są liczone od 1.

Schemat powinien być jawnie wersjonowany.

Należy uwzględnić także metadane dotyczące wersji analizatora, listy analizowanych plików po rozwinięciu globów. Szczegółowa reprezentacja tych metadanych może zostać ustalona podczas implementacji wspólnego kontraktu.

### Raport czytelny

Przykład:

| Function | Cognitive | Statements | Cyclomatic |
| --- | ---: | ---: | ---: |
| `process_events` | 22 | 78 | 12 |
| `calculate_speed` | 3 | 12 | 4 |
| `update_state` | 17 | 45 | 9 |

*Wartości przykładowe.*

Raport powinien:

- Przedstawiać pomiary bez automatycznego wydawania ocen architektonicznych.
- Pokazywać wszystkie outer pasujące do --filter, a bez filtra wszystkie znalezione outer. Kolejność: ścieżka pliku, następnie pozycja funkcji w pliku; wartości metryk i null nie zmieniają kolejności.
- Zachowywać lokalizacje pozwalające otworzyć wskazany fragment kodu.
- Pokazywać null dla niedostępnego pomiaru, bez przyczyny i osobnego statusu.
- Pozostawać deterministyczny dla tego samego kodu, konfiguracji i wersji analizatora.

Nie sumujemy metryk do jednego Complexity Score.

## 7. Interfejs CLI

Jedyny publiczny punkt wejścia to `measure.mjs`.

Przykładowe uruchomienie dla Rust:

```bash
node scripts/measure.mjs \
  --path ./src/main.rs \
  --format markdown \
  --output complexity-report.md
```

Przykład dla JavaScript:

```bash
node scripts/measure.mjs \
  --path ./web/src/main.js \
  --format json \
  --output complexity-report.json
```

Przykłady globów i mieszanych języków (PowerShell):

```powershell
node scripts/measure.mjs --path "./src/*.rs"
node scripts/measure.mjs --path "./src/*.js"
node scripts/measure.mjs --path "./src/**/*.rs"
node scripts/measure.mjs --path "./src/main.rs" --path "./web/**/*.js"
node scripts/measure.mjs --path "./src/**/*.rs" --path "./src/**/*.js" --format json --output ./complexity-report.json
```

* dopasowuje nazwy w jednym katalogu. **/ dopasowuje zero lub więcej poziomów podkatalogów, więc ./src/**/*.rs obejmuje też pliki bezpośrednio w src. Globy przekazujemy w cudzysłowach, aby rozwijał je analizator jednakowo na wszystkich systemach. Ścieżki i wzorce względne odnoszą się do cwd wywołania. Plik dopasowany przez kilka argumentów analizujemy raz; kolejność jest deterministyczna. Parser dobieramy osobno dla każdego pliku: .rs to Rust, .js to JavaScript. Raport przechowuje język przy funkcji/pliku, a nie jako jeden wspólny język całego uruchomienia.

Glob bez dopasowań wnosi pustą listę; jeśli wszystkie wzorce dają puste wejście, wynik to pusty raport i kod 0. Brak pliku podanego dosłownie jest błędem odczytu i daje kod 1. Plik o nieobsługiwanym rozszerzeniu nie jest po cichu odrzucany: pozostaje w analyzed_files z language: null, nie tworzymy dla niego rekordów funkcji, a uruchomienie kończy się kodem 1. Pozostałe pliki nadal są analizowane. Taki plik zwiększa summary.files, ale nie functions_found ani functions_presented.

Przewidziane parametry:

| Parametr | Znaczenie |
| --- | --- |
| --path | Ścieżka pliku lub glob; opcję można powtórzyć i łączyć języki |
| --format | json lub markdown; --explain zawsze wymusza markdown |
| --output | Plik docelowy raportu |
| --explain | Przyrosty wszystkich trzech metryk przy liniach oryginalnego kodu, zawsze w Markdown |
| --filter | Dokładne nazwy outer rozdzielone znakiem pionowej kreski; filtr wyników |

Jedynym kryterium zakresu są pliki wskazane wprost lub dopasowane do globów przekazanych przez --path. Nie stosujemy wykluczeń, .gitignore, klasyfikacji testów ani kodu generowanego. Nie oceniamy aktywności cfg. Znaczenie kodu interpretuje LLM. Rekurencyjne dopasowanie wymaga wzorca z **, np. ./src/**/*.rs; sama ścieżka katalogu nie oznacza automatycznie analizy jego zawartości.

Sama analiza odczytuje kod.

Kody zakończenia CLI: **0 — nie wystąpił błąd; 1 — wystąpił błąd**. Wygenerowanie raportu nie kasuje błędu, który wystąpił podczas uruchomienia. Ta zasada nie zmienia reprezentacji niedostępnych pomiarów jako null ani nie wymaga opisywania ich przyczyn.

Po błędzie jednego pliku analizator kontynuuje pracę nad pozostałymi plikami i kończy kodem 1. Pusta lista plików jest poprawnym wejściem: zwraca pusty raport (zero plików, zero funkcji) i kod 0.

Nie wykorzystujemy częściowo poprawnego drzewa. Plik z błędem parsowania pozostaje w analyzed_files z językiem rozpoznanym po rozszerzeniu, ale nie tworzymy dla niego żadnych rekordów funkcji. Zwiększa summary.files, nie zwiększa functions_found ani functions_presented. Analizujemy pozostałe pliki i kończymy kodem 1, bez opisu przyczyny błędu. Tak samo postępujemy przy błędzie odczytu pliku. Null dla metryki dotyczy funkcji rozpoznanej w poprawnie sparsowanym pliku, gdy danej metryki nie można obliczyć.

### Explain i filtrowanie wyników

--explain jest flagą bez wartości. Zawsze zwraca Markdown, również przy --format json; ma pierwszeństwo przed --format niezależnie od kolejności argumentów. Explain nie ma wariantu JSON. Pokazuje wszystkie trzy metryki: Cognitive, Cyclomatic, Statements. Nie zmienia pomiarów ani kodu zakończenia. Bez flagi nie dodajemy szczegółów wyjaśnienia do raportu.

W Markdown każda prezentowana funkcja outer otrzymuje lokalizację i blok kodu z oznaczeniem języka. W kopii przeznaczonej do raportu usuwamy istniejące komentarze i dodajemy własne komentarze // z przyrostami Cognitive, Cyclomatic i Statements oraz krótką nazwą naliczonej reguły. Wszystkie trzy metryki są pokazane; 0 oznacza brak przyrostu. Przyrosty na tej samej linii sumujemy osobno dla każdej metryki. Po funkcji dodajemy komentarz z sumami.

```rust
fn choose(x: bool) -> i32 { // Cognitive: 0; Cyclomatic: +1 (baza outer); Statements: 0
    if x {                 // Cognitive: +1 (if); Cyclomatic: +1 (if); Statements: +1 (if)
        1                  // Cognitive: 0; Cyclomatic: 0; Statements: +1 (niejawne zwrócenie)
    } else {               // Cognitive: +1 (else); Cyclomatic: 0; Statements: 0
        2                  // Cognitive: 0; Cyclomatic: 0; Statements: +1 (niejawne zwrócenie)
    }                      // Cognitive: 0; Cyclomatic: 0; Statements: 0
}                          // Cognitive: 0; Cyclomatic: 0; Statements: 0
// Cognitive: 2; Cyclomatic: 2; Statements: 3
```

Usuwanie komentarzy dotyczy tylko prezentacji, po pomiarze oryginalnego kodu. Korzystamy z zakresów komentarzy rozpoznanych przez parser, nie z regexu usuwającego podobne znaki w literałach. Usuwamy komentarze liniowe, blokowe i dokumentacyjne; zachowujemy podziały linii i odstęp potrzebny do nierozdzielania lub niesklejania tokenów. Literały, raw strings, regexy JS i tekst template literals zachowują zawartość, także znaki //, /*, */ i |. Komentarze wewnątrz interpolacji traktujemy jak komentarze kodu. 

Komentarz z punktacją dopisujemy na końcu linii, jeśli znajduje się on poza wielowierszowym literałem. Dla linii wewnątrz takiego literału umieszczamy punktację w osobnym komentarzu po jego zakończeniu, z numerem oryginalnej linii. Nie wstawiamy punktacji do treści literałów. Długość ogrodzenia Markdown dobieramy tak, by backticki w kodzie nie zamknęły bloku przypadkowo. Explain jest widokiem obliczeń, a nie plikiem do uruchomienia.

Baza Cyclomatic przypada na linię początku outer. Przyrost konstrukcji przypisujemy do linii jej początku, logicznego operatora do linii operatora. Wiersze obejmują również linie bez punktów. Funkcje wewnętrzne są w kodzie outer, bez osobnych wyjaśnień.

Dla niedostępnej metryki wartość i przyrosty w komentarzach to null, bez przyczyny, statusu ani pozornie pełnej sumy częściowej. Pozostałe dostępne metryki nadal mogą mieć wyjaśnienie. Explain prezentuje pomiar, nie diagnozuje błędów składni.

--filter "funkcja|inna_funkcja|nazwa_outer" wybiera rekordy outer według dokładnej nazwy, z rozróżnieniem wielkości liter. Znak | oznacza alternatywę nazw; nie jest regexem. Wszystkie pasujące outer pozostają, także o tej samej nazwie w różnych plikach. Nazwa funkcji wewnętrznej nie wybiera jej ani nie wybiera rodzica. Filtr działa również bez explain. Brak dopasowań daje puste zestawienie; sam w sobie nie jest błędem. Filtr nie usuwa błędów wykrytych w analizowanych plikach i nie zmienia zakresu plików określonego przez --path.

Kolejność: analiza plików → filtr nazw outer → prezentacja wszystkich pasujących rekordów (z explain albo bez). Metryki wybranego outer zawsze obejmują całe jego wnętrze. Zestawienie ujawnia liczbę wszystkich znalezionych outer i liczbę prezentowanych po filtrze, aby skrócenie raportu było widoczne. Kody 0/1 zależą od całej analizy, również gdy filtr nie zostawi wyników.

Przykłady PowerShell:

```powershell
node scripts/measure.mjs --path "./src/main.rs" --explain
node scripts/measure.mjs --path "./src/**/*.rs" --path "./src/**/*.js" --explain --output ./complexity-explain.md
node scripts/measure.mjs --path "./src/**/*.rs" --explain --filter "funkcja|inna_funkcja|nazwa_outer"
node scripts/measure.mjs --path "./src/**/*.js" --explain --filter "process|save" --output ./complexity-explain.md
node scripts/measure.mjs --path "./src/**/*.js" --filter "process|save" --format json
```

Wartość --filter ujmujemy w cudzysłowy, żeby powłoka nie potraktowała | jako potoku.

## 8. Liczniki raportu i interpretacja

Metryki Cognitive Complexity, Statement Count i Cyclomatic Complexity są mierzone dla poszczególnych outer, wraz z ich funkcjami zagnieżdżonymi.

Podsumowanie całego raportu zawiera wyłącznie trzy liczniki: files (analizowane pliki), functions_found (znalezione outer) i functions_presented (outer prezentowane po filtrze). Wyniki metryk pozostają przy rekordach outer.

Nie ustalamy na starcie sztywnych progów jakości. Początkowo zależy nam na rzetelnych wynikach i możliwości porównania fragmentów kodu.

Progi i ostrzeżenia mogą zostać dodane później, na podstawie obserwacji rzeczywistych projektów.

## 9. Architektura implementacji

Zakładamy następujący przepływ:

```text
CLI arguments
    |
    v
measure.mjs
    |
    +-- Language detection by file extension
    |
    +-- Input files and glob expansion
    |
    v
Language analyzer
    |
    +-- AST parsing
    +-- Function discovery
    +-- Control-flow analysis
    |
    v
Normalized measurements
    |
    v
measure.mjs
    |
    +-- Validation
    +-- Aggregation
    +-- Kolejność według ścieżki pliku i pozycji funkcji
    |
    v
Unified JSON / Markdown report
```

Główne zasady:

**Deterministyczność.** Metryki wynikają z analizy kodu, a nie z oceny modelu językowego.

**Rozdzielenie odpowiedzialności.** Skrypty językowe odpowiadają za analizę, a `measure.mjs` za kontrakt, orkiestrację i raportowanie.

**Jedna definicja metryk.** Różne języki nie powinny używać przypadkowo różnych interpretacji tych samych nazw.

**Rozszerzalność.** Dodanie nowego języka polega przede wszystkim na stworzeniu kolejnego analizatora i podłączeniu go do wspólnego interfejsu.

**Niedostępny pomiar.** Zwracamy wyłącznie null. Nie diagnozujemy ani nie opisujemy przyczyn.

**Brak automatycznej refaktoryzacji.** Skill dostarcza pomiary, nie zmienia kodu.

## 10. Testowanie i walidacja

Każda metryka musi mieć deterministyczne testy z oczekiwanymi wynikami.

### Cognitive Complexity

Testować:

- Płaskie rozgałęzienia.
- Zagnieżdżone warunki.
- Łańcuchy `else if`.
- Pętle.
- Wyrażenia logiczne.
- `match` / `switch`.
- Closures i funkcje zagnieżdżone.

### Statement Count

Testować:

- Różne formatowania tego samego kodu.
- Kilka instrukcji w jednej linii.
- Deklaracje i przypisania.
- Końcowe wyrażenia Rust.
- Łańcuchy metod.
- Arrow functions i expression statements.

### Cyclomatic Complexity

Testować:

- Bazowy wynik 1 dla każdego raportowanego outer, również pustego, w obu językach. Funkcje zagnieżdżone nie dodają kolejnej bazy.
- Niezależne i zagnieżdżone warunki: ta sama liczba if daje ten sam wynik.
- Łańcuch if/else-if/else oraz wybór gałęzi według ustalonych przyrostów.
- Pętle bez zależności od liczby iteracji.
- Brak dodatkowych punktów za same return/break/continue.
- Każdy operator logiczny &&/||, także poza warunkiem if.
- Wliczanie wszystkich funkcji wewnętrznych i closures do outer, bez osobnych rekordów i podwójnego zliczania.
- Wynik liczbowy w JSON i deterministyczna kolejność według ścieżki pliku oraz pozycji funkcji.

Porównujemy odpowiadające sobie konstrukcje Rust i JavaScript o tej samej strukturze przepływu, zgodnie z regułami projektu. Dla takich konstrukcji oczekujemy identycznych wyników każdej metryki; samo podobieństwo działania programów nie jest podstawą tego oczekiwania.


## 11. Zakres pierwszej wersji

Pierwsza wersja powinna zapewniać:

- Działający skill z `SKILL.md`.
- Jeden publiczny interfejs `measure.mjs`.
- Obsługę Rust.
- Obsługę JavaScript.
- Trzy wybrane metryki.
- Wyniki dla funkcji.
- Jeden wspólny kontrakt raportowania.
- Eksport JSON i Markdown.
- Testy jednostkowe i integracyjne.
- Dokumentację reguł liczenia i ograniczeń.

Nie implementujemy na tym etapie:

- Automatycznego proponowania lub wykonywania refaktoryzacji.
- TypeScript i C#.

Architektura powinna jednak umożliwiać późniejsze dodanie porównań raportów bez zmiany ich podstawowego kontraktu.

## 12. Kryteria akceptacji

Skill uznajemy za gotowy do pierwszego użycia, gdy:

1. Ten sam interfejs CLI obsługuje Rust i JavaScript.
2. Wszystkie trzy metryki mają opisane i przetestowane reguły liczenia.
3. Wyniki nie zależą od formatowania kodu.
4. Cyclomatic Complexity liczy bazę oraz przyrosty według uzgodnionej tabeli językowej, bez dodatkowej opłaty za zagnieżdżenie; JSON zawiera liczbę całkowitą.
5. Niedostępny pomiar ma tylko null, zamiast pozornej wartości zerowej.
6. Raport zawiera lokalizacje analizowanych funkcji.
7. JSON i Markdown mają zgodną semantycznie strukturę danych.
8. Plik bez pomiarów pozostaje w wykazie analizowanych plików; niedostępne pomiary mają null, bez opisu przyczyny.
9. Sama analiza odczytuje kod; zmiany komentarzy na potrzeby explain dotyczą prezentacji.
10. Dodanie kolejnego języka nie wymaga modyfikacji istniejących analizatorów.
11. Wyniki są deterministyczne oraz nadają się do dalszego automatycznego przetwarzania.

12. Równoważne konstrukcje we wszystkich obsługiwanych językach dają takie same wyniki każdej metryki; sprawdza to UC-14.

## 13. Docelowe wykorzystanie

Skill ma być niezależnym narzędziem pomiarowym, możliwym do uruchomienia przez programistę lub agenta.

Przykładowy proces:

1. Agent implementuje zmianę.
2. Uruchamia `code-complexity-metrics`.
3. Otrzymuje raport outer oraz liczniki całego raportu.
4. Identyfikuje obszary o podwyższonych wynikach.
5. Przeprowadza osobny Code Review, uwzględniając kontekst i odpowiedzialności komponentów.

W przyszłości ten sam mechanizm może wspierać porównywanie metryk przed zmianą i po zmianie, pokazując, czy implementacja zwiększyła lub zmniejszyła złożoność.

**Główna zasada projektu: mierzymy właściwości kodu w sposób powtarzalny i porównywalny, ale nie utożsamiamy wysokiej wartości metryki z błędem projektowym.**

Zakres pomiaru ogranicza się do składni funkcji, metod i closures. Nie ustalamy typów odbiorców, pochodzenia wywoływanych metod ani zależności modułowych. `vec.sort()` i `value.to_string()` są zwykłymi wyrażeniami: nie zwiększają złożoności decyzji, a Statement Count dodaje 1 za każde wywołanie, oprócz punktów za deklarator lub return.

Dystrybucja: runtime Tree-sitter JS/WASM i gotowe gramatyki Rust/JavaScript przechowujemy w Git razem z kodem skilla, w vendor/tree-sitter/, z licencjami i manifestem wersji. Użytkownik potrzebuje Node 24 LTS jako minimalnej wspieranej linii; pierwsze i kolejne uruchomienie nie wymagają npm install, sieci ani kompilacji.

Cognitive: sekwencje && oraz || liczymy identycznie w Rust i JavaScript (+1 za pierwszą sekwencję i każdą zmianę operatora), zgodnie z [regułami metryk](code-complexity-metric-rules.md). JS ?? nie dodaje punktów Cognitive.
