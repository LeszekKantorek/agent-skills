# Docelowa architektura Code Complexity Metrics

V1: Node.js, bezpośrednio uruchamiane moduły .mjs, Tree-sitter WASM, Rust i JavaScript. To projekt skilla; istniejący prototyp obsługuje tylko podzbiór składni.

## Struktura

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

## Przebieg

1. CLI przyjmuje pliki i globy przez powtarzalny --path. Rozwija tylko te wzorce, usuwa powtórzenia plików i dobiera parser po rozszerzeniu każdego pliku (.rs → Rust, .js → JavaScript). Jedno uruchomienie może obejmować oba języki.
2. Parser odczytuje składnię. Jego sygnał błędu wyklucza całe drzewo pliku z wyodrębniania funkcji: nie wykorzystujemy częściowo poprawnego drzewa i nie tworzymy rekordów jego funkcji. Plik pozostaje w analyzed_files z językiem według rozszerzenia i zwiększa tylko licznik plików. Błąd skutkuje końcowym kodem 1. Nie diagnozujemy przyczyny w raporcie; pozostałe pliki nadal są analizowane.
3. Adapter wyodrębnia funkcje, metody i closures, ich lokalizacje oraz konstrukcje wewnątrz ciał.
4. Wspólny model zachowuje rodzaje instrukcji, decyzje, zagnieżdżenia i kolejność operatorów.
5. Trzy silniki obliczają metryki każdej funkcji głównej pomiaru (outer), obejmujące cały kod jej funkcji zagnieżdżonych i closures, bez osobnych wyników dla tych jednostek. Przykład przypisania funkcji do wyników znajduje się w [regułach metryk](code-complexity-metric-rules.md#jednostka-pomiaru-outer).
6. Po analizie stosujemy --filter do nazw outer, następnie prezentujemy wszystkie pasujące rekordy w kolejności ścieżki pliku i pozycji outer w pliku. Walidowany model zasila JSON i Markdown; --explain zawsze wybiera Markdown i dodaje przyrosty przy liniach kodu, niezależnie od --format.

Każdy plik można przetworzyć niezależnie. Po przetworzeniu zwalniamy drzewo WASM. Nie budujemy indeksu nazw, grafu wywołań ani zależności modułowych. Nie ustalamy typów ani pochodzenia metod.

## Minimalny model

- SourceUnit: język, ścieżka i hash. Dla nieobsługiwanego rozszerzenia wpis analyzed_files ma language: null i nie powstają rekordy funkcji; plik jest uwzględniany w globalnym liczniku files.
- FunctionUnit: raportowane outer, identyfikator lokalizacyjny, nazwa, rodzaj, zakres i pełne ciało wraz z funkcjami wewnętrznymi. Nazwa: własna nazwa funkcji, w jej braku nazwa zmiennej przechowującej funkcję, w braku obu null. Węzły wewnętrzne zachowują zagnieżdżenie, ale nie tworzą nowych rekordów pomiaru.
- Konstrukcje: instrukcje, decyzje, zagnieżdżenia sterowania, sekwencje operatorów oraz nieobsługiwane węzły.
- Właścicielem pomiaru jest outer; wszystkie instrukcje i decyzje wewnętrznych funkcji i closures zwiększają jego wynik dokładnie raz.

Nie kopiujemy całego drzewa parsera ani informacji typowych. Wyrażenia w argumentach, inicjalizatorach i interpolacjach nadal mogą zawierać decyzje i wymagają odwiedzenia.

## Metryki

**Cognitive Complexity:** wersjonowany profil składniowy oparty na SonarSource. Koszt konstrukcji, zagnieżdżeń i sekwencji operatorów; bez punktów za rekurencję bezpośrednią i pośrednią. To jawna adaptacja, nie deklaracja pełnej zgodności z SonarSource. Funkcje wewnętrzne i closures dziedziczą zagnieżdżenie outer i dodają poziom 1; punktacja pozostałych konstrukcji i skoków jest zatwierdzona w regułach metryk.

**Statement Count:** każde jawne wywołanie +1, także w łańcuchu, argumencie, deklaracji i return. Deklaratory, przypisania, sterowanie i zwrócenie wartości liczymy osobno. Wrapper wyrażenia nie podwaja wywołania. Dodatkowy blok kodu dodaje 1 Statement; bezpośrednie ciała funkcji i konstrukcji nie dostają osobnego punktu według reguł metryk. Otaczające bloki nie mnożą niejawnych zwrotów. Rust tail i expression-arrow liczymy jak niejawne return. Obowiązuje tabela w lokalnych regułach metryk.

**Cyclomatic Complexity:** [uzgodnione tabele projektu](code-complexity-metric-rules.md) dla JavaScript i Rust. Wynik per outer, ze wszystkimi decyzjami jednostek wewnętrznych. Baza wynosi 1 na raportowane outer, również puste; funkcje wewnętrzne nie rozpoczynają nowych liczników. Zwykłe else nie zwiększa Cyclomatic, ale dodaje 1 w Cognitive. Wynik liczbowy jest nieujemny.

## Raport i błędy

Trzy metryki mają wartość liczbową albo null, bez osobnych statusów i opisów przyczyn. Niedostępny pomiar ma tylko null; nie podstawiamy zera. Makro jest pojedynczym wywołaniem: Statements +1, Cognitive/Cyclomatic +0; wnętrze pomijamy bez ekspansji. Samo makro nie powoduje null. Definicja macro_rules! wewnątrz outer dodaje 1 Statement, bez analizy wnętrza i bez osobnego rekordu; definicja poza funkcjami nie trafia do raportu funkcji.

Wersjonujemy schema_version, rules_version i analyzer_version. Raport zawiera wersję parsera, listę analizowanych plików po rozwinięciu globów, identyfikatory i lokalizacje funkcji. Ścieżki są względne z separatorem /. Porządek jest deterministyczny: ścieżka pliku, następnie pozycja outer. Metryki pokazujemy przy rekordach outer. Podsumowanie całego raportu zawiera wyłącznie files, functions_found i functions_presented.

Kody zakończenia: 0, jeżeli nie wystąpił błąd; 1, jeżeli wystąpił błąd. Po błędzie jednego pliku analizujemy pozostałe; końcowy kod wynosi 1. Pusta lista plików daje pusty raport i kod 0. Niedostępne pomiary mają null; raport nie zawiera komunikatów o przyczynach. Brak parsera nie uruchamia cichego zastępstwa opartego na regex.

## Środowisko

Gotowy runtime Tree-sitter JS/WASM i gramatyki Rust/JavaScript przechowujemy w Git razem z kodem, w vendor/tree-sitter/. Dołączamy licencje oraz manifest wersji, pochodzenia i hashów. Użytkownik potrzebuje tylko Node: bez npm install, kompilacji i pobierania przy pierwszym ani kolejnych uruchomieniach. Parsery ładujemy względem lokalizacji skilla. Aktualizacje zależności są jawnie wprowadzane do repozytorium. Minimalna wspierana linia to Node 24 LTS, z aktualnymi poprawkami. Dotychczas sprawdzono Node 24.21.0 na Windows; pozostałe platformy i nowsze linie Node wymagają weryfikacji. Nie jest to deklaracja technicznego minimum biblioteki Tree-sitter. Przygotowanie plików vendor i weryfikacja licencji pozostają zadaniem implementacyjnym. Analiza nie uruchamia aplikacji, Cargo ani zależności badanego projektu.


### Niedostępny pomiar

Jedyna reprezentacja niedostępnej metryki to null. Nie dodajemy pól reason, reasons, message, diagnostics ani statusu metryki. Nie implementujemy diagnozowania składni ani klasyfikowania przyczyn. Korzystamy z sygnału błędu gotowego parsera lub informacji, że licznik nie potrafi obliczyć wartości. Nie wykorzystujemy częściowo poprawnego drzewa. Plik z błędem parsowania pozostaje w analyzed_files z językiem rozpoznanym po rozszerzeniu, ale nie tworzymy dla niego żadnych rekordów funkcji. Zwiększa summary.files, nie zwiększa functions_found ani functions_presented. Analizujemy pozostałe pliki i kończymy kodem 1, bez opisu przyczyny błędu. Tak samo traktujemy błąd odczytu. Dla funkcji rozpoznanych w poprawnie sparsowanych plikach niedostępne wartości metryk to null. Brak opisu przyczyny dotyczy raportu pomiarów; kod zakończenia CLI wynosi 0 bez błędu lub 1 przy błędzie.

Cognitive: sekwencje && oraz || liczymy identycznie w Rust i JavaScript (+1 za pierwszą sekwencję i każdą zmianę operatora), zgodnie z [regułami metryk](code-complexity-metric-rules.md). JS ?? nie dodaje punktów Cognitive.

## Explain i filtr wyników

Kontrakt CLI i przykłady: sekcja „Explain i filtrowanie wyników” w code-complexity-prompt.md. --filter wybiera dokładne nazwy outer rozdzielone |, również bez --explain. Outer z name: null pozostaje w raporcie bez filtra, ale nie pasuje do filtra nazw. Nie jest filtrem plików ani funkcji wewnętrznych. Nie zmienia pomiaru outer ani kodu błędu całego uruchomienia.

Liczniki emitują przyrosty z lokalizacjami; te same zdarzenia tworzą sumy metryk i dane wyjaśnienia. Nie implementujemy drugiego algorytmu liczenia na potrzeby explain. Renderer agreguje przyrosty wiersza, usuwa komentarze z kopii do raportu według zakresów parsera i dodaje komentarze // z punktacją trzech metryk oraz sumami według kontraktu explain. Explain jest wyłącznie Markdown; JSON nie zawiera wyjaśnienia liniowego. Wewnętrzny model zachowuje lokalizacje, tekst źródłowy i przyrosty potrzebne rendererowi. Null nie ma opisu przyczyny. Zmiana komentarzy dotyczy wyłącznie raportu; zawartość literałów pozostaje niezmieniona.
