# Code Complexity Metrics

Zakres: Cognitive Complexity, Statement Count i Cyclomatic Complexity dla outer wraz z funkcjami wewnętrznymi i closures Rust/JavaScript. Analiza składniowa bez rozpoznawania typów i pochodzenia metod. Cognitive używa profilu bez punktów za rekurencję.

Implementacja docelowa: .mjs uruchamiane bezpośrednio w Node, gotowe parsery Tree-sitter WASM.

- [Wymagania](code-complexity-prompt.md)
- [Uzgodnione reguły metryk](code-complexity-metric-rules.md)
- [Architektura](code-complexity-architecture.md)
- [Obserwacje i wybór parsera](code-complexity-observations.md)
- [Plan pracy](code-complexity-plan.md)
- [Plan weryfikacji](code-complexity-verification-plan.md)
- [Prototyp](complexity-spike/README.md)

Prototyp obsługuje ograniczony podzbiór składni; nie jest gotowym skillem. Lokalny klon msfs2024-artificial-horizon służy do E2E parsera i przyszłej walidacji metryk. Analizowana aplikacja nie jest uruchamiana ani modyfikowana.


Dystrybucja: runtime Tree-sitter JS/WASM i gotowe gramatyki Rust/JavaScript przechowujemy w Git razem z kodem skilla, w vendor/tree-sitter/, z licencjami i manifestem wersji. Użytkownik potrzebuje Node 24 LTS jako minimalnej wspieranej linii; pierwsze i kolejne uruchomienie nie wymagają npm install, sieci ani kompilacji.

Zakres wejścia: --path przyjmuje pliki i globy. Rozwijamy tylko podane wzorce, bez dodatkowych wykluczeń i filtrowania testów, kodu generowanego ani cfg. Język rozpoznajemy po rozszerzeniu; można łączyć Rust i JavaScript w jednym uruchomieniu.

CLI: --explain zawsze zwraca Markdown (ma pierwszeństwo przed --format) i usuwa oryginalne komentarze w raporcie, dodając komentarze z punktacją Cognitive, Cyclomatic i Statements; --filter "funkcja|inna_funkcja|nazwa_outer" wybiera dokładne nazwy outer; raport obejmuje wszystkie pasujące rekordy w kolejności ścieżki pliku i pozycji funkcji. Kontrakt i przykłady znajdują się w wymaganiach, a przypadki UC-15/UC-16 w planie weryfikacji.
