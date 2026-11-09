# Prototyp parsera i Cyclomatic Complexity

Kod `.mjs` działa bezpośrednio w Node i używa gotowego `@vscode/tree-sitter-wasm@0.3.1` dla Rust i JavaScript, bez kompilacji parsera.

`simpleMetrics(fn)` w `parser.mjs` zwraca np.:

```json
{ "cognitive": 3, "statements": 6, "cyclomatic_complexity": 4 }
```

Przykład odpowiada trzem płaskim if, każdy z jednym prostym wywołaniem. Cyclomatic jest liczbą: bazowe 1 + liczba if. Zagnieżdżenie wpływa na Cognitive, ale nie zwiększa dodatkowo Cyclomatic. Same return, komentarze, bloki i proste wywołania nie dodają decyzji. Liczymy zapisaną składnię bez analizy osiągalności, także instrukcje za bezwarunkowym return.

Wyniki kontrolne: funkcja pusta → 1; trzy płaskie lub zagnieżdżone if → 4; 4/8/64 if → 5/9/65.

## Zakres

Silnik metryk obsługuje proste bloki, if bez else ze zwykłym warunkiem, bezargumentowe wywołania nazwanej funkcji, proste return oraz wybrane końcowe wyrażenia Rust. Pętle, else/else-if, złożone warunki (w tym &&/||), deklaracje i inne konstrukcje poza podzbiorem są odrzucane błędem. Nie jest to pełna implementacja reguł docelowego skilla.

Parser rozpoznaje więcej składni niż ten ograniczony silnik. `scan.mjs` tworzy inwentaryzację parsera; nie generuje raportu wszystkich metryk.

## Uruchomienie

Z katalogu `.local/complexity-spike/`:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run scan
```

Instalacja zależności jest potrzebna, jeśli nie są jeszcze dostępne. E2E wykorzystuje lokalny klon `../msfs2024-artificial-horizon/` z przypiętym commitem. Analizowana aplikacja nie jest uruchamiana ani kompilowana.

Aktualne wymagania pełnego skilla: [indeks dokumentów](../README.md).

Docelowe [reguły metryk](../code-complexity-metric-rules.md) wymagają rozszerzenia prototypu o każde wywołanie jako dodatkową instrukcję, deklaratory, niejawne zwrócenia i pozostałą składnię. Obecne testy nie potwierdzają całego kontraktu ani UC-14. Baza pustej funkcji wynosi 1 w obu językach.

Skan katalogu w scan.mjs służy tylko eksperymentowi parsera. Docelowy analizator przyjmuje pliki i globy przez --path, rozwija tylko podane wzorce bez dodatkowych wykluczeń i rozpoznaje język po rozszerzeniu. Obecny skaner nie jest wzorcem kontraktu wejścia.

Docelową jednostką wszystkich metryk jest outer razem z funkcjami wewnętrznymi i closures. Inwentaryzacja parsera w prototypie nadal wylicza wszystkie węzły funkcji; nie jest listą docelowych rekordów raportu. Silnik prototypu wymaga dostosowania do agregacji outer. Cognitive zachowuje głębokość i zwiększa ją o 1 przy wejściu do funkcji wewnętrznej; instrukcje i decyzje trafiają do outer bez osobnych wyników.

--explain i --filter są częścią docelowego CLI opisanego w wymaganiach. Prototyp jeszcze ich nie implementuje.
