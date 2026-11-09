# Code Complexity Metrics: obserwacje i wybór parsera

Stan: 2026-11-09. Analiza `code-complexity-prompt.md`, propozycja architektury oraz lokalny eksperyment. To nie jest jeszcze implementacja gotowego skilla.

Aktualny zakres: **Cognitive Complexity, Statement Count, Cyclomatic Complexity**. Rekomenduję **Node.js + gotowy Tree-sitter WebAssembly + niewielki wspólny model kodu**. Uruchomienie nie wymaga kompilatora Rust/C/C++, Emscripten ani kompilacji analizowanego projektu. Działający eksperyment znajduje się w `complexity-spike/`. Docelowa architektura: [code-complexity-architecture.md](code-complexity-architecture.md). Plan: [code-complexity-plan.md](code-complexity-plan.md).

## 1. Uzgodnione założenia

Zachować: trzy oddzielne metryki, deterministyczność, wspólny kontrakt, lokalizacje, jawne ograniczenia, brak automatycznej refaktoryzacji i brak zbiorczego wyniku jakości. Podział na wejście CLI, adaptery językowe i raportowanie jest właściwy. Nazwy `measure.py` oraz osobne skrypty Python nie są warunkiem działania tego podziału.

Uzgodnione decyzje do zastosowania podczas implementacji:

1. **Cyclomatic ma ustaloną punktację językową.** Obowiązują [reguły projektu dla JavaScript i Rust](code-complexity-metric-rules.md), z raportowaniem per funkcja główna pomiaru (outer), obejmującym jej funkcje zagnieżdżone i closures bez osobnych rekordów. Nie mnożymy ścieżek ani nie dodajemy kosztu za zagnieżdżenie.
2. **Statement Count jest konwencją projektu.** Każde wywołanie dodaje 1. Return i deklarator liczymy dodatkowo: return save() = 2, let x = a().b() = 3. Same wrappery parsera nie dodają punktów.
3. **Każda metryka ma liczbę albo null.** Makra liczymy jako pojedyncze wywołania bez analizowania wnętrza; nie powodują same z siebie null. Niedostępny pomiar zapisujemy jako null, bez osobnego statusu ani przyczyny.
4. **Identyfikatory lokalizacyjne nie są stabilne między zmianami pliku.** Nadają się do jednego raportu. Porównywanie wersji wymaga później dopasowania symboli; przesunięcie linii nie może być traktowane jak pewne usunięcie funkcji.
5. **Źródło Rust nie jest rozwiniętym programem.** Polityka makr jest ustalona: pojedyncze wywołanie bez analizy wnętrza. Analizujemy wszystkie przekazane pliki, także testy i kod generowany; cfg nie filtruje treści. V1 analizuje zapis źródłowy bez rozwijania makr i bez wybierania konfiguracji kompilacji.
6. Przyszłe TS/C# mają otrzymać adaptery dopiero przy rzeczywistej implementacji. Nie tworzyć pustych plików.


## 2. Tree-sitter, AST i CST

**Parser** rozpoznaje strukturę kodu według gramatyki języka. **AST** to abstrakcyjne drzewo składni; **CST** zachowuje więcej szczegółów zapisu. Tree-sitter tworzy CST, z którego można odczytać nazwane węzły, pola, zakresy i błędy. Nie trzeba kopiować całego drzewa do własnego AST. [Dokumentacja Tree-sitter](https://tree-sitter.github.io/tree-sitter/).

W praktyce adapter Rust rozpoznaje `function_item`, `if_expression`, `match_expression` i `closure_expression`; adapter JS rozpoznaje odpowiedniki. Oba tłumaczą potrzebne informacje na wspólny model. Tree-sitter nie jest kompilatorem ani systemem rozwiązywania typów. Samo `object.save()` nie mówi, która implementacja `save` zostanie wywołana.

Tree-sitter ma natywne bindingi oraz wariant WebAssembly. Ten drugi można uruchomić w Node. Gotowe gramatyki muszą pasować do ABI runtime; przypinamy i testujemy zestaw, zamiast osobno aktualizować przypadkowe najnowsze paczki. [Web binding](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md).

### Potwierdzony wariant bez kompilacji

W eksperymencie użyto `@vscode/tree-sitter-wasm@0.3.1`. Jedna paczka dostarcza runtime JavaScript/WASM i gotowe gramatyki Rust oraz JS. Instalacja `npm install --ignore-scripts --no-audit --no-fund` dodała jedną zależność; uruchomienie testów nie wymagało budowania. Repozytorium dostawcy opisuje również budowanie paczki, ale są to czynności producenta, nie użytkownika gotowego wydania. [Źródło paczki](https://github.com/microsoft/vscode-tree-sitter-wasm).

Odczytane rozmiary paczki: archiwum 2 053 205 bajtów, rozpakowane pliki 22 082 102 bajty. Zawiera również niepotrzebne teraz języki. Same dwa parsery, runtime WASM i JS zajmują około 1,90 MB. Dla docelowej dystrybucji przechowujemy ten zestaw w Git w vendor/tree-sitter/, z licencjami, pochodzeniem i hashami; przygotowanie tych plików pozostaje niewykonane. Nie należy kopiować samych binariów bez sprawdzenia wymaganych informacji licencyjnych.

Rozróżniamy:

- **Bez kompilacji użytkownika:** potwierdzone na gotowych plikach WASM.
- **Bez instalowania zależności:** docelowo runtime i parsery są w Git razem ze skillem; użytkownik potrzebuje Node.
- **Bez sieci podczas analizy:** wymagane już przy pierwszym uruchomieniu pobranej kopii skilla; wszystkie zasoby pochodzą z vendor/.
- **Bez żadnego runtime:** wymaga gotowych programów dla systemów/architektur; nie jest rekomendacją dla V1.

## 3. Wybrane środowisko

Implementacja jest w JavaScript .mjs, uruchamianym bezpośrednio w Node. Runtime Tree-sitter i gramatyki WASM Rust/JS dostarczamy w vendor/tree-sitter/ razem z kodem w Git. Użytkownik nie instaluje zależności i nie kompiluje skilla. Minimalna wspierana linia to Node 24 LTS, z aktualnymi poprawkami; dotychczas sprawdzono Node 24.21.0 na Windows. Pozostałe platformy wymagają weryfikacji.

## 4. Która metryka potrzebuje czego

Żadna z trzech metryk nie wymaga zachowania całego AST kompilatora z typami. Wszystkie potrzebują czegoś więcej niż wyszukiwania tekstowych wzorców.

| Metryka | Minimalna wiarygodna reprezentacja | Pełna semantyka / typy | Czy regex wystarczy? |
| --- | --- | --- | --- |
| Cognitive Complexity | Rodzaje konstrukcji, zagnieżdżenia, sekwencje operatorów, granice funkcji | Nie; profil pomija punkty za rekurencję | Nie |
| Statement Count | Kategorie instrukcji/wyrażeń i relacje rodzic–dziecko | Nie | Nie; średniki zawodzą m.in. przez Rust tail expressions i JS ASI |
| Cyclomatic Complexity | Granice funkcji, rodzaje i liczba punktów decyzji, operatory logiczne | Nie dla przyjętego liczenia składniowego | Nie; trzeba odróżnić kod od danych i ciała funkcji zagnieżdżonych |

Cognitive Complexity należy oprzeć na SonarSource 1.7: koszt struktury i zagnieżdżenia, specjalne reguły `else if`, logicznych sekwencji, `switch`, etykiet, z jawnym pominięciem punktów za rekurencję. Zwykły wczesny `return` nie zwiększa tej metryki. Implementacja dla Rust potrzebuje opisanej adaptacji; nie deklarujemy zgodności z produktem Sonar bez testów. [Definicja SonarSource](https://www.sonarsource.com/docs/CognitiveComplexity.pdf).

Cyclomatic można liczyć jednym przejściem po strukturze funkcji: bazowe 1 + przyrosty według wspólnych reguł konstrukcji. Nie wymaga grafu przepływu, mnożenia ścieżek ani algebry normal/return. Nadal potrzebujemy drzewa, żeby rozróżniać konstrukcje i ich właścicieli.

### Dlaczego nie regex

Tekst `"if (x) { ; }"`, komentarz, regex JS `/[{};]/` i raw string Rust zawierają znaki podobne do instrukcji. Klamry występują też w obiektach, blokach, interpolacjach i makrach. Wnętrza funkcji zagnieżdżonych zwiększają liczbę instrukcji outer; nie tworzą osobnych rekordów raportu. Usunięcie komentarzy regexem nie rozwiązuje rozróżniania literałów i kontekstów.

Lexer ze stosem może obsłużyć wybrany podzbiór, ale po dodaniu priorytetów operatorów, `else`, `match`, closures i zakresów staje się własnym parserem. Nie potrzebujemy wykrywania nagłówków kodu generowanego ani filtrów wyboru plików.

## 5. Czy pisać własne AST

Własny **model danych** jest wskazany. Własny **parser Rust i JS** nie jest wskazany. Pierwsze zadanie oznacza kilka rodzajów węzłów i adaptery; drugie wymaga implementacji i utrzymania gramatyk, diagnostyki oraz niejednoznaczności języków.

Moduł ir.mjs przechowuje tylko dane potrzebne metrykom, a parser.mjs obsługuje gotowe drzewo Tree-sitter. Nie implementujemy własnego parsera ani diagnozowania składni.

## 6. Weryfikacja na wskazanym repozytorium

Kopia: `.local/msfs2024-artificial-horizon/`, commit `3e8fd243938e80083e6629fe53d72591b2f1bbba`. Pobrano płytki klon. Nie uruchamiano aplikacji, Cargo, skryptów projektu ani kompilacji. Skan dotyczył wszystkich `.rs` i `.js`, również testów; pomijał `.git`, `node_modules`, `target`, `dist` i nie podążał za symlinkami.

Środowisko: Windows, Node `v24.21.0`, npm `11.19.0`. Wynik eksperymentu:

| Obserwacja | Rust | JavaScript |
| --- | ---: | ---: |
| Pliki | 34 | 34 |
| Węzły funkcji/metod/closures | 885 | 224 |
| Pliki z błędami parsowania | 0 | 0 |
| Wywołania składniowe | 5676 | 798 |
| Makra | 1410 | 0 |
| Operator `?` Rust | 145 | — |
| `match` | 68 | — |
| Closures / arrow functions | 394 | 66 |


Przykłady wymagające reguł w docelowym silniku:

- `web/helpers.js`: trzy nazwane funkcje; sprawdzone ręcznie i przez test. `clamp` ma jedną instrukcję `return`, ale dwa wywołania metod Math.
- `web/telemetry/validation.js`: krótkie spięcia, ternary, optional chaining i zagnieżdżone arrow functions. Nie można liczyć tylko instrukcji `if`.
- `src/http/sse.rs`: async closure, `match`, wczesny `return` wewnątrz closure oraz łańcuchy metod. Ten return zwiększa Statement Count funkcji zewnętrznej events, choć wykonawczo kończy closure; nie modelujemy skutków wykonania.
- `src/providers/simconnect/runtime.rs`: `?`, closures, ścieżki symboli i metody. Tree-sitter widzi składnię, ale nie wyznacza typów odbiorców metod.
- `src/application.rs`: `tokio::select!` podlega wspólnej regule makr: Statements +1, Cognitive/Cyclomatic +0. Nie rozwijamy ani nie analizujemy wnętrza makra; samo wystąpienie makra nie powoduje null.
- `#[cfg(test)]` nie wyłącza kodu z pomiaru w przekazanym pliku.


E2E sprawdza dwukrotne uruchomienie CLI, deterministyczność JSON, parsowanie obu języków i niezmienność źródeł. Silnik metryk obsługuje ograniczony podzbiór. Pełna weryfikacja skilla pozostaje zaplanowana.

Artefakty: `code-complexity-parser-report.json`, `code-complexity-test-results.txt`, `code-complexity-wasm-hashes.json`, `complexity-spike/package-lock.json`. Testowany commit jest przypięty w E2E; aktualizacja klona wymaga świadomej aktualizacji oczekiwań.

Uruchomienie aktualnego prototypu z katalogu repozytorium:

```powershell
Set-Location .local/complexity-spike
npm ci --ignore-scripts --no-audit --no-fund
npm test
node scan.mjs ../msfs2024-artificial-horizon ../code-complexity-parser-report.json
```

Weryfikacja dotyczy jednego środowiska Windows i jednego zestawu parserów. Nie potwierdza jeszcze macOS/Linux, wydajności dużych monorepo ani zgodności wszystkich reguł metryk. Wszystkie nowe materiały są w ignorowanym przez Git `.local/`; nie utworzono commita ani nie wykonano push.

## Granica uproszczenia

Pozostałe metryki nie wymagają ustalania, czy wywołanie pochodzi z naszego modułu. Nadal wymagają struktury ciała funkcji: decyzji w argumentach i interpolacjach, zagnieżdżeń oraz granic closures. Samo znalezienie początku i końca funkcji nie wystarcza. Gotowy parser WASM pozostaje rekomendacją; alternatywa to własny lexer i parser utrzymywane osobno dla Rust i JS. Regex może służyć filtrowaniu plików, lecz nie stanowi wiarygodnego silnika tych metryk.

Cognitive: sekwencje && oraz || liczymy identycznie w Rust i JavaScript (+1 za pierwszą sekwencję i każdą zmianę operatora), zgodnie z [regułami metryk](code-complexity-metric-rules.md). JS ?? nie dodaje punktów Cognitive.
