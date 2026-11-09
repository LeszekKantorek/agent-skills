# Uzgodnione reguły metryk

## Zakres i źródła

Ten dokument jest obowiązującym źródłem reguł projektu. Implementacja i oczekiwania testów mają wynikać z poniższych tabel. Nie zastępujemy ich regułami zewnętrznego analizatora. W razie luki doprecyzowujemy ten dokument przed implementacją danej konstrukcji.

Wszystkie trzy metryki raportujemy dla funkcji zewnętrznej (outer), łącznie z całym kodem jej wewnętrznych funkcji, metod i closures. Jednostki wewnętrzne nie mają osobnych wyników.

Materiały pomocnicze (nie zastępują reguł projektu):

- [Sonar Rust 1.x: cyclomatic_complexity.rs](https://github.com/SonarSource/sonar-rust/blob/master/analyzer/src/visitors/cyclomatic_complexity.rs) — licznik i testy.
- [SonarSource Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) — podstawa profilu Cognitive.

Reguły projektu wersjonujemy niezależnie od parsera. Aktualizacja parsera ani materiałów pomocniczych nie zmienia punktacji. W razie rozbieżności obowiązują tabele w tym dokumencie.

## Jednostka pomiaru: outer

Outer to najbardziej zewnętrzna funkcja/metoda w danym zagnieżdżeniu składniowym. Nie oznacza wyłącznie funkcji publicznej lub eksportowanej. Funkcje na poziomie modułu i metody klasy/impl poza funkcją mają własne rekordy. Arrow/closure poza inną funkcją może samo być outer. Wszystko zagnieżdżone wewnątrz outer należy do jego pomiaru, także pośrednio przez kilka poziomów.

Nazwy używane w dokumentacji: **funkcja główna pomiaru (outer)** otrzymuje własny wynik, a **funkcja zagnieżdżona** jest zdefiniowana wewnątrz innej funkcji i wlicza się do jej outer. Funkcja anonimowa lub closure może należeć do każdej z tych grup — decyduje miejsce definicji, nie nazwa, eksport ani widoczność.

```javascript
function process() {              // funkcja główna pomiaru: własny wynik
    function validate() {         // funkcja zagnieżdżona: część process
        function check() {}       // kolejny poziom: nadal część process
    }

    const save = () => {};        // closure zagnieżdżona: część process
    validate();                   // wywołanie; nie liczymy ponownie ciała validate
}

function calculate() {}           // osobna funkcja główna pomiaru
const refresh = () => {};         // arrow poza inną funkcją: osobny wynik
```

Raport zawiera dokładnie trzy rekordy: process, calculate i refresh. Rekord process obejmuje cały kod validate, check i save, również gdy nie są wywoływane. Te trzy funkcje zagnieżdżone nie mają osobnych rekordów. Puste calculate i refresh pozostają w raporcie. Metoda klasy lub Rust impl poza inną funkcją również otrzymuje własny wynik; metoda zdefiniowana wewnątrz funkcji należy do jej outer. Ta sama zasada zagnieżdżenia obowiązuje w Rust i JavaScript.

- Cognitive: przy wejściu do funkcji wewnętrznej lub closure zachowujemy aktualną głębokość i zwiększamy ją o 1. Sama deklaracja nie dodaje punktu; punktowane konstrukcje wewnątrz korzystają z tej głębokości. Po wyjściu przywracamy poprzednią głębokość.
- Statement Count: wszystkie instrukcje, deklaratory, wywołania i zwrócenia wartości wewnątrz trafiają do outer. Nie mnożymy ich przez liczbę wywołań funkcji wewnętrznej. Osobno zapisane wywołanie inner() nadal dodaje 1 zgodnie z regułą wywołań.
- Cyclomatic: jedno bazowe 1 dla outer i wszystkie decyzje, również z funkcji wewnętrznych. Sama deklaracja funkcji wewnętrznej nie dodaje kolejnej bazy.
- Raport i liczba raportowanych funkcji uwzględniają tylko outer. Wewnętrzne lokalizacje mogą służyć analizatorowi, ale nie tworzą osobnych wyników ani sumowanych powtórnie rekordów.
- Ciało funkcji wewnętrznej liczymy również wtedy, gdy nie widzimy jej wywołania; nie analizujemy osiągalności. Wnętrze makr pozostaje pomijane zgodnie z odrębną regułą makr.

Przykład: if w outer (+1), w nim closure, w niej if (+3) i jeszcze jeden zagnieżdżony if (+4) daje Cognitive outer = 8. Cyclomatic outer = 4 (jedna baza i trzy if). Nie powstaje osobny wynik closure. Ta sama struktura ma te same wyniki w Rust i JavaScript.

## Cyclomatic — JavaScript

| Konstrukcja | Przyrost |
| --- | ---: |
| Raportowane outer (funkcja/metoda/arrow), również puste | +1 bazowe |
| if i każde else-if | +1 |
| for, for-in, for-of, while, do-while | +1 |
| Operator warunkowy ?: | +1 |
| Każdy operator &&, \|\|, ?? | +1 |
| Każda gałąź switch, w tym default i gałąź bez instrukcji | +1 |
| Samo switch, else, catch, throw, return, break, continue | 0 |
| Optional chaining ?. | 0 |
| Zwykłe wywołanie, klamry, zagnieżdżenie | 0 |

Liczymy węzły wyrażeń logicznych, nie każdy token podobny do operatora. Przypisania &&=, ||= i ??= nie mają własnego przyrostu w tym liczniku. Konstrukcje w argumentach, inicjalizatorach i return również podlegają odwiedzeniu.

## Cyclomatic — Rust

| Konstrukcja | Przyrost |
| --- | ---: |
| Raportowane outer (funkcja/metoda/closure), również puste | +1 bazowe |
| if i każde else-if | +1 |
| loop, while, for | +1 |
| Każdy operator &&, \|\| | +1 |
| Każda gałąź match, również _ i gałąź z pustym ciałem {} | +1 |
| Sam guard przy gałęzi | 0 |
| Samo match, else, ?, return, break, continue | 0 |
| Zwykłe wywołanie, klamry, zagnieżdżenie | 0 |

Operatory logiczne i inne punktowane konstrukcje wewnątrz guarda nadal zwiększają wynik. Wzorce alternatywne nie są dodatkowymi gałęziami match.

Pustość ciała nie wyłącza funkcji ani gałęzi z pomiaru. Match/switch bez gałęzi nie dodaje decyzji Cyclomatic; sama konstrukcja ma Statement Count +1 i Cognitive +1 wraz z kosztem zagnieżdżenia. Pusta funkcja ma Cognitive 0, Statement Count 0 i Cyclomatic 1 oraz pozostaje w raporcie.

## Cognitive — if, else-if i else

- Wynik zaczyna od 0; brak punktów za samą deklarację funkcji.
- if dodaje 1 oraz koszt aktualnego zagnieżdżenia sterowania.
- else-if dodaje 1 bez dodatkowego kosztu zagnieżdżenia za sam łańcuch.
- Zwykłe else dodaje 1, bez dodatkowego kosztu zagnieżdżenia za samo else.
- Konstrukcje wewnątrz gałęzi nadal uwzględniają odpowiednie zagnieżdżenie.
- Profil pozostaje składniowy, bez punktów za rekurencję.

## Cognitive — pętle, wybór gałęzi i skoki

Poniższe reguły są zatwierdzone i wspólne dla języków posiadających daną konstrukcję.

| Konstrukcja | Przyrost Cognitive |
| --- | --- |
| Pętla, w tym Rust loop | +1 oraz aktualna głębokość zagnieżdżenia |
| Cały match/switch | +1 oraz aktualna głębokość zagnieżdżenia |
| catch | +1 oraz aktualna głębokość zagnieżdżenia |
| Operator warunkowy ?: | +1 oraz aktualna głębokość zagnieżdżenia |
| Sama gałąź match/switch, w tym domyślna | 0 |
| break/continue z etykietą | +1, bez kosztu zagnieżdżenia |
| Zwykłe break, continue, return, throw | 0 |
| Rust ? i JS ?. | 0 |
| Zwykłe wywołanie funkcji lub metody | 0 |

W ciele pętli, gałęziach match/switch, ciele catch i obu gałęziach ?: głębokość jest większa o 1. Liczba gałęzi match/switch nie zwiększa sama Cognitive. Samo try/finally nie dodaje punktów ani poziomu zagnieżdżenia. Punkty za inne konstrukcje zawarte w tych fragmentach nadal obowiązują. Po opuszczeniu konstrukcji przywracamy poprzednią głębokość. Zagnieżdżenie funkcji wewnętrznych działa według reguły outer.

Warunek konstrukcji analizujemy na dotychczasowej głębokości Cognitive; dodatkowy poziom obowiązuje dopiero w jej ciele lub gałęziach. Dotyczy to również podwyrażeń nagłówka (np. inicjalizatora, warunku i aktualizacji for, wyrażenia dopasowywanego przez match/switch oraz warunku ?:). Konstrukcje zagnieżdżone w tych wyrażeniach nadal stosują własne reguły wzrostu głębokości. Nie pomijamy punktów za konstrukcje w warunku. Funkcje zagnieżdżone i closures zachowują własną regułę dodania poziomu. Zasada jest wspólna dla Rust i JavaScript tam, gdzie składnia występuje.

```javascript
function condition(a, b, c) {
    if (a ? b : c) {}    // +1: if; +1: ternary w warunku na tej samej głębokości
}
// Cognitive: 2

function body(a, b, c) {
    if (a) {            // +1: if
        use(b ? c : a); // +2: ternary w ciele if; wywołanie use dodaje 0
    }
}
// Cognitive: 3
```

Przykłady: match z trzema prostymi wywołaniami w gałęziach daje Cognitive 1. Jeśli w jednej gałęzi występuje if z atomowym warunkiem, wynik to 3 (match +1, if +2). Pętla z takim if daje 3; dodanie break z etykietą daje 4. Samo first(); w gałęzi daje +0 Cognitive, ale +1 Statement Count. Wywołanie funkcji wewnętrznej nie powoduje ponownego naliczania jej ciała.


## Cognitive — wspólne reguły operatorów Rust i JavaScript

W obu językach liczymy sekwencje && oraz || jednakowo: +1 za pierwszą sekwencję i +1 za każdą zmianę operatora w obrębie jednego wyrażenia logicznego. Nie doliczamy kosztu zagnieżdżenia do tych punktów. Powtórzenie tego samego operatora w sekwencji nie zwiększa wyniku.

| Wyrażenie | Cognitive Rust | Cognitive JavaScript |
| --- | ---: | ---: |
| a && b && c | 1 | 1 |
| a &#124;&#124; b &#124;&#124; c | 1 | 1 |
| a && b &#124;&#124; c | 2 | 2 |
| a &#124;&#124; b && c &#124;&#124; d | 3 | 3 |
| a && b &#124;&#124; c && d | 3 | 3 |

Nawiasy grupujące nie dodają punktów ani same nie przerywają sekwencji. Osobne argumenty, instrukcje i ciała funkcji tworzą odrębne sekwencje operatorów, ale punkty z ciał funkcji wewnętrznych trafiają do wyniku outer. Negacja otaczająca wyrażenie logiczne wyznacza odrębne podwyrażenie: a && !(b && c) ma koszt 2. Nie sklejamy sekwencji przez takie granice.

JS ?? pozostaje bez punktów Cognitive; nie jest operatorem ||. Rust nie ma odpowiednika tego operatora. Reguła dotyczy Cognitive; Cyclomatic nadal liczy każdy && i || osobno, a w JS także każdy ??.

## Wspólne zasady wszystkich metryk

Równoważne konstrukcje dostępne w różnych językach mają takie same reguły i wyniki Cognitive, Cyclomatic oraz Statement Count. Zasada obowiązuje również przyszłe adaptery. Składnia bez odpowiednika nie wymaga sztucznego odpowiednika. Nie utożsamiamy dowolnych semantycznie równoważnych programów: porównujemy te same konstrukcje i strukturę przepływu.

## Statement Count — ustalone reguły

Każde jawne wywołanie funkcji lub metody dodaje 1, niezależnie od pochodzenia i rozpoznania celu. Liczymy także wywołania w argumentach, warunkach, inicjalizatorach, return i łańcuchach. Każde miejsce zapisane w kodzie liczymy raz, bez mnożenia przez liczbę wykonań.

Deklaracja dodaje 1 za każdy deklarator; destrukturyzacja ze wspólnym inicjalizatorem to jeden deklarator. Przypisanie, instrukcja sterująca i jawne return dodają po 1 oprócz wywołań wewnątrz. Niejawne zwrócenie wartości (Rust tail lub expression-arrow) liczymy jak return: +1 oraz zawarte wywołania. Klasyfikacja ogona nie może podwajać już policzonego if/match.

Końcowe if i match w Rust: konstrukcja dodaje 1, a wnętrze każdej gałęzi liczymy osobno. Końcowa wartość gałęzi dodaje 1 za niejawne zwrócenie oraz punkty za zawarte wywołania. Else i oznaczenie ramienia nie dodają osobnych punktów Statement Count. Blok będący bezpośrednim ciałem gałęzi nie dostaje osobnego punktu; dalsze bloki wewnątrz podlegają regule dodatkowych bloków. Nie dodajemy kolejnego niejawnego return za wynik całego if/match. Przy zagnieżdżonych wyborach stosujemy tę zasadę rekurencyjnie, bez podwajania zwrotu konstrukcji. Jawne return zastępuje niejawne zwrócenie w danym miejscu, nie dodaje obu naraz.

```rust
fn choose(x: bool) -> i32 {
    if x {        // +1: if
        1         // +1: niejawne zwrócenie
    } else {      // 0
        2         // +1: niejawne zwrócenie
    }
}
// Statement Count: 3

fn choose_match(x: bool) -> i32 {
    match x {     // +1: match
        true => 1,  // +1: niejawne zwrócenie
        false => 2, // +1: niejawne zwrócenie
    }
}
// Statement Count: 3
```

Zastąpienie obu stałych przez first() i second() daje w każdym przykładzie Statement Count 5: konstrukcja 1 oraz po 2 za wywołanie i zwrócenie w każdej gałęzi. Odpowiedniki z jawnymi return mają te same wyniki. Liczymy wszystkie zapisane gałęzie, niezależnie od wykonania.

### If i match jako inicjalizator w Rust

Reguła wartości gałęzi obowiązuje również, gdy if lub match jest inicjalizatorem zmiennej, a nie końcowym wyrażeniem funkcji. Deklarator dodaje 1, konstrukcja if/match dodaje 1, a końcowa wartość każdej gałęzi dodaje 1 za niejawne zwrócenie wartości z gałęzi oraz punkty za wywołania. Nie dodajemy dodatkowego punktu za przekazanie wyniku całej konstrukcji do zmiennej. Else i oznaczenia ramion nie dodają punktów. Przy zagnieżdżonych wyborach nie podwajamy zwrotu całej konstrukcji.

```rust
fn example(b: bool) {
    let x =                 // +1: deklarator
        if b {              // +1: if
            1               // +1: wartość gałęzi
        } else {
            2               // +1: wartość gałęzi
        };
}
// Statement Count: 4

fn example_match(b: bool) {
    let x =                 // +1: deklarator
        match b {           // +1: match
            true => 1,      // +1: wartość gałęzi
            false => 2,     // +1: wartość gałęzi
        };
}
// Statement Count: 4
```

W obu przykładach zastąpienie wartości 1 i 2 przez first() i second() daje Statement Count 6: deklarator 1, if/match 1, dwa niejawne zwroty 2 i dwa wywołania 2. Umieszczenie całego wyrażenia w jednej linii nie zmienia wyniku. Wyrażenie zwracające wartość gałęzi liczymy według tej samej reguły niezależnie od tego, czy wynik trafia do inicjalizatora, czy stanowi końcową wartość funkcji.

### Operator ?: w JavaScript — Statement Count

Operator warunkowy ?: liczymy jak if zwracający wartość w Rust: +1 za konstrukcję wyboru, +1 za wartość każdej gałęzi oraz punkty za zawarte wywołania. Deklarator otaczający wyrażenie dodaje osobno 1. Nie dodajemy punktu za sam wrapper wyrażenia ani za przekazanie wyniku całego wyboru do zmiennej. Przy zagnieżdżonym wyborze stosujemy regułę rekurencyjnie, bez podwajania zwrotu całej konstrukcji.

```javascript
function example(b) {
    const x = b ? 1 : 2;
    // +1: deklarator; +1: ?:; +1: wartość pierwszej gałęzi; +1: wartość drugiej gałęzi
}
// Statement Count: 4

function example_calls(b) {
    const x = b ? first() : second();
    // +1: deklarator; +1: ?:; +2: wartości gałęzi; +2: wywołania
}
// Statement Count: 6
```

Odpowiedniki Rust let x = if b { 1 } else { 2 }; oraz wariant z first()/second() mają odpowiednio te same wyniki 4 i 6. Ta punktacja dotyczy Statement Count; reguły Cognitive i Cyclomatic dla ?: pozostają określone w ich tabelach.

### Definicja nazwanej funkcji zagnieżdżonej — Statement Count

Samodzielna deklaracja nazwanej funkcji zagnieżdżonej dodaje 1 Statement do funkcji głównej pomiaru (outer), również gdy ciało jest puste. Zasada obejmuje deklarację function w JavaScript i lokalną definicję fn w Rust, na każdym poziomie zagnieżdżenia. Instrukcje jej ciała nadal doliczamy osobno do tego samego outer. Definicja samego outer nie dodaje punktu: puste outer ma Statements 0.

```javascript
function outer() {
    function inner() {}       // +1: definicja funkcji zagnieżdżonej
}
// Statements outer: 1

function with_arrow() {
    const inner = () => {};   // +1: deklarator; bez dodatkowego punktu za arrow
}
// Statements with_arrow: 1
```

```rust
fn outer() {
    fn inner() {}             // +1: definicja funkcji zagnieżdżonej
}
// Statements outer: 1
```

Funkcja będąca wartością deklaratora nie dodaje osobnego punktu za samą definicję, niezależnie od tego, czy ma nazwę. Dotyczy to arrow, anonimowego function expression i nazwanego function expression w JavaScript oraz closure w Rust: deklarator jest już policzony. Ciało nadal doliczamy do outer według zwykłych reguł. Reguła definicji nie zmienia punktacji Cognitive ani bazy Cyclomatic i nie tworzy osobnego rekordu funkcji zagnieżdżonej.

Przykład JavaScript wewnątrz outer:

```javascript
function outer() {
    const a = () => {};                // +1: deklarator
    const b = function() {};           // +1: deklarator
    const c = function named() {};     // +1: deklarator, bez dodatkowego punktu za nazwę
}
// Statements outer: 3
```

Samodzielne function named() {} wewnątrz outer nadal dodaje 1 za deklarację funkcji. Nie należy utożsamiać deklaracji function z nazwanym wyrażeniem function przypisanym do zmiennej.

### Dodatkowe bloki kodu — Statement Count

Każdy dodatkowy blok kodu dodaje 1 Statement, również pusty. Blok będący bezpośrednim ciałem funkcji, closure, pętli, gałęzi if/match/switch lub try/catch/finally nie dostaje osobnego punktu. Kolejny blok wewnątrz takiego ciała jest dodatkowy i dodaje 1. Blok użyty jako inicjalizator zmiennej również dodaje 1. Reguła jest wspólna dla Rust i JavaScript tam, gdzie dana składnia występuje.

Liczymy bloki rozpoznane w składni, nie znaki klamer: obiekty, struktury, importy, destrukturyzacja i literały nie są dodatkowymi blokami kodu. Wnętrza makr nadal pomijamy. Cognitive i Cyclomatic nie dostają punktów ani dodatkowego zagnieżdżenia za sam taki blok.

Końcową wartość liczymy raz według reguły niejawnego zwrócenia. Nie doliczamy kolejnych niejawnych zwrotów za przekazanie tej samej wartości przez otaczające bloki; punkty za dodatkowe bloki są liczone osobno. Blok bez końcowego wyrażenia nie otrzymuje punktu za domyślną wartość unit.

```rust
fn example() -> i32 { // ciało funkcji: 0
    {                // dodatkowy blok: +1
        {            // dodatkowy blok: +1
            {        // dodatkowy blok: +1
                1    // niejawne zwrócenie: +1
            }
        }
    }
}
// Statement Count: 4

fn initializer() {
    let result = {   // deklarator: +1; dodatkowy blok: +1
        prepare();   // wywołanie: +1
        calculate()  // wywołanie i niejawne zwrócenie: +2
    };
}
// Statement Count: 5
```

```javascript
function example() { // ciało funkcji: 0
    {                // dodatkowy blok: +1
        work();      // wywołanie: +1
    }
}
// Statement Count: 2
```

Puste outer ma nadal Statements 0; outer zawierające jeden dodatkowy pusty blok ma 1. Zwykły if z dwiema wartościami gałęzi ma nadal 3, a jego wariant inicjalizujący zmienną ma 4: bezpośrednie ciała gałęzi nie są dodatkowymi blokami.

### Wiązania wzorców w Rust — Statement Count

Wiązanie wzorca w if let, while let i nagłówku for dodaje 1 Statement oprócz punktu za konstrukcję sterującą i punktów za wywołania. Wspólny wzorzec destrukturyzujący kilka zmiennych jest jednym wiązaniem, nie osobnym punktem za każdą nazwę. Jest to ta sama zasada co jeden deklarator z destrukturyzacją; nie dodajemy ponownie punktu za let ponad punkt wiązania.

```rust
if let Some(value) = item {       // +1: if; +1: wiązanie
    consume(value);               // +1: wywołanie
}
// Statements: 3

while let Some(value) = next() {  // +1: pętla; +1: wiązanie; +1: wywołanie
    consume(value);               // +1: wywołanie
}
// Statements: 4

for value in values {            // +1: pętla; +1: wiązanie
    consume(value);               // +1: wywołanie
}
// Statements: 3

for (key, value) in pairs {}      // +1: pętla; +1: wspólne wiązanie
// Statements: 2
```

Powyższe fragmenty są ciałami funkcji. Nie doliczamy niejawnych wywołań mechanizmu iteracji. Odpowiadający JavaScript for (const value of values) { consume(value); } ma Statements 3: pętla, deklarator i wywołanie. Przyrost wiązania dotyczy Statement Count; sam nie dodaje punktu Cognitive ani Cyclomatic.

### Zastosowanie reguł ogólnych do gałęzi — Statement Count

Poniższe przypadki wynikają z liczenia konstrukcji sterujących i ich instrukcji, bez osobnego punktu za oznaczenie gałęzi:

- Else if dodaje 1 za if; samo else dodaje 0. Wywołania warunku i ciała liczymy osobno.
- Catch dodaje 1 za konstrukcję sterującą; instrukcje jego ciała liczymy normalnie.
- Switch dodaje 1. Etykiety case i default dodają 0; instrukcje i jawne wywołania w gałęziach nadal liczymy.
- Bezpośrednie bloki ciał nie dodają punktu, a dodatkowe bloki wewnątrz podlegają regule dodatkowych bloków.

```javascript
function branches(a, b) {
    if (a) {          // +1: if
        first();      // +1: wywołanie
    } else if (b) {   // +1: if
        second();     // +1: wywołanie
    } else {          // 0: oznaczenie gałęzi
        third();      // +1: wywołanie
    }
}
// Statements: 5

function choice(x) {
    switch (x) {      // +1: switch
        case 1:       // 0: etykieta
            first();  // +1: wywołanie
            break;    // +1: instrukcja sterująca
        default:      // 0: etykieta
            second(); // +1: wywołanie
    }
}
// Statements: 4
```

Fragment catch (w poprawnej konstrukcji try/catch): catch (error) { recover(); } wnosi 2 Statements: catch +1 i recover() +1. To przyrost tego fragmentu, nie wynik całej funkcji. Reguły Cognitive i Cyclomatic pozostają niezależne od powyższej punktacji Statement Count.

### Pozostałe instrukcje i przykłady

Samodzielne wyrażenie zapisane jako instrukcja, np. x;, 42; lub x + 1;, dodaje 1. Jeśli tę instrukcję już punktujemy przez zawarte wywołania, przypisania lub aktualizacje, nie dodajemy punktu za sam wrapper wyrażeniowy: save(); daje 1, value.trim().toLowerCase(); daje 2, x++; daje 1, x = 3; daje 1. Reguła dotyczy Rust i JavaScript tam, gdzie dana składnia występuje. Nie dodajemy punktu za każdy operand ani podwyrażenie; niejawne zwroty nadal podlegają własnej regule.

Samodzielna pusta instrukcja ; dodaje 1. Inkrementacja/dekrementacja (x++, ++x, x--, --x) dodaje 1 za każdy operator aktualizacji. Wrapper instrukcji nie dodaje drugiego punktu. Rust nie ma operatorów ++/--; tam odpowiednie przypisanie x += 1 dodaje 1.

Przypisanie złożone (np. +=, -=) liczymy jak przypisanie: +1 oraz punkty za wywołania wewnątrz. Jawne wywołanie konstruktora new Foo() liczymy jako wywołanie: +1 oraz wywołania w argumentach. Nie rozpoznajemy implementacji konstruktora ani nie doliczamy operacji przez niego wykonywanych.

Liczymy puste instrukcje rozpoznane przez parser, nie wszystkie średniki. Średnik kończący instrukcję, separator w nagłówku for i średnik w stringu lub komentarzu nie są osobnymi pustymi instrukcjami. Nie analizujemy średników wewnątrz pomijanego wnętrza makra.

Sam wrapper instrukcji wyrażeniowej nie dodaje punktu do policzonego wywołania: save(); = 1, a nie 2. Dodatkowe bloki kodu liczymy według poniższej reguły. Instrukcje wewnątrz bloku użytego jako wartość liczymy dodatkowo. Instrukcje i wywołania z funkcji wewnętrznych i closures trafiają do licznika outer, po jednym razie. Wywołań niejawnych przez operatory nie traktujemy jako jawnych wywołań funkcji. Makra podlegają poniższej regule pojedynczego wywołania.

| Fragment | Statement Count | Wyprowadzenie |
| --- | ---: | --- |
| x; / 42; / x + 1; | po 1 | Samodzielne wyrażenie jako instrukcja |
| x = 3; | 1 | Przypisanie, bez dodatkowego punktu za wrapper |
| ; | 1 | Jedna pusta instrukcja |
| ;; | 2 | Dwie puste instrukcje |
| save(); | 1 | Jedno wywołanie |
| save();; | 2 | Wywołanie i jedna pusta instrukcja |
| x++; / ++x; (JS) | 1 | Jeden operator aktualizacji |
| x += 1; | 1 | Jedno przypisanie złożone |
| x += calculate(); | 2 | Przypisanie i wywołanie |
| new Foo(); (JS) | 1 | Jedno wywołanie konstruktora |
| let x = new Foo(load()); (JS) | 3 | Deklarator, konstruktor i load |
| value.trim().toLowerCase(); | 2 | Dwa wywołania |
| outer(inner()); | 2 | Dwa wywołania |
| let a = 1, b = 2; (JS) | 2 | Dwa deklaratory |
| let a = 1; let b = 2; (Rust/JS) | 2 | Dwa deklaratory |
| Destrukturyzacja pary z gotowej wartości | 1 | Jeden deklarator |
| let x = load(); | 2 | Deklarator i wywołanie |
| let x = a().b(); | 3 | Deklarator i dwa wywołania |
| return save(); | 2 | Return i wywołanie |
| return 42; | 1 | Return |
| Rust tail 42 / ciało arrow () => 42 | 1 | Niejawne zwrócenie |
| Rust tail calculate() / ciało arrow () => calculate() | 2 | Niejawne zwrócenie i wywołanie |
| if check() { save(); } (odpowiednia składnia Rust/JS) | 3 | If i dwa wywołania |
| let result = { prepare(); calculate() }; (Rust) | 5 | Deklarator, dodatkowy blok, prepare, niejawne zwrócenie i calculate |

Ta reguła liczenia wywołań zastępuje wcześniejsze propozycje pomijania ich wewnątrz deklaracji i return. Nazwa Statement Count oznacza powyższą konwencję projektu; nie jest prostym liczeniem węzłów nazwanych statement.

## Oczekiwania przyszłych testów

| Przypadek | Cyclomatic | Cognitive |
| --- | ---: | ---: |
| Pusta funkcja JS | 1 | 0 |
| Pusta funkcja Rust {} | 1 | 0 |
| Funkcja z prostym wywołaniem, bez decyzji | 1 | 0 |
| Jeden if/else na poziomie funkcji, proste wywołania w gałęziach | 2 | 2 |
| if/else-if/else na poziomie funkcji, proste wywołania w gałęziach | 3 | 3 |
| Trzy płaskie if | 4 | 3 |
| Trzy zagnieżdżone if | 4 | 6 |

Dodatkowe przypadki Cyclomatic: JS funkcja z samym switch i dwiema gałęziami case oraz default → 4; Rust funkcja z match i trzema niepustymi gałęziami, w tym _ → 4; funkcja JS z samym return a ?? b → 2; z samym return a?.b → 1; funkcja Rust z samym load()?; → 1. Test guarda ma odróżnić zwykłe porównanie od &&/||. Testy JS catch/throw potwierdzają brak przyrostu tych konstrukcji.

To oczekiwania planowanych testów, nie wynik ich wykonania. Poprawny wynik jest nieujemną liczbą całkowitą, a niedostępny pomiar ma wyłącznie null, bez przyczyny i statusu metryki.

## Makra Rust

Każde wywołanie makra, np. println!(), vec![] i tokio::select! {}, jest pojedynczym wywołaniem: Statement Count +1, Cognitive +0 i Cyclomatic +0. Nie rozwijamy makr ani nie analizujemy ich tokenów wewnętrznych jako instrukcji, wywołań, gałęzi czy closures. Reguła obowiązuje niezależnie od rodzaju nawiasów i nazwy makra. Wystąpienie makra samo w sobie nie powoduje null.

Otaczające konstrukcje nadal są liczone: let x = vec![]; ma Statement Count 2 (deklarator + makro), a return vec![]; ma 2 (return + makro). Macro_invocation nie jest definicją funkcji i nie tworzy dodatkowego rekordu funkcji w raporcie. Definicja macro_rules! wewnątrz outer dodaje 1 Statement za definicję, bez analizowania jej wnętrza. Nie jest wywołaniem, nie tworzy osobnego rekordu i sama nie dodaje punktów Cognitive ani Cyclomatic. Definicja poza funkcjami nie trafia do raportu funkcji. Ta reguła ma pierwszeństwo przed liczeniem bloków, wywołań, decyzji i funkcji zapisanych wewnątrz definicji: pomijamy całe jej wnętrze.

```rust
fn outer() {
    macro_rules! answer { // +1: definicja; wnętrze pomijamy
        () => { 42 };
    }
    answer!();            // +1: wywołanie; bez rozwijania
}
// Statements: 2; Cognitive: 0; Cyclomatic: 1 (baza outer)
```

Nieużywana definicja wewnątrz outer również daje 1 Statement. Liczba ramion makra i zawartość szablonów nie zmieniają tego punktu.

Adapter korzysta z węzła macro_invocation gotowego parsera; jego wnętrze token_tree pomija przy liczeniu metryk. Nie próbuje odtwarzać składni rozwiniętego programu.
