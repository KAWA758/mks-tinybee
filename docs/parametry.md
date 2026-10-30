# Parametry ramienia w jednym miejscu

Edytuj **`fluidnc/config.yaml`**, następnie `tools/fluidnc.py upload-config --port COMx`. Narzędzie wysyła plik przez XMODEM i restartuje ESP32; nie trzeba kompilować ani wgrywać firmware. Komentarze w YAML tylko w osobnych liniach — FluidNC nie obsługuje komentarza po wartości. Wcięcia muszą być spacjami.

X = napęd pierwszego przegubu, Y = drugiego, Z = obrót podstawy. Jednostka: stopień obrotu wyjścia napędu; FluidNC nadal używa nazw `mm`.

Poniżej `*` oznacza sekcję `axes: x|y|z`. Każda oś ma osobne wartości.

| Klucz | Początkowo | Znaczenie |
| --- | --- | --- |
| `*.steps_per_mm` | 15.802469 | Impulsy STEP na 1°. Wpisz wynik wzoru poniżej. |
| `*.max_rate_mm_per_min` | 120 | Maks. prędkość osi w °/min (120 = 2°/s). Limituje także jog. |
| `*.acceleration_mm_per_sec2` | 10 | Przyspieszenie osi w °/s². |
| `*.max_travel_mm` | 10 | Szerokość okna ruchu w stopniach. |
| `*.soft_limits` | true | Odrzuca G0/G1 poza oknem (alarm); jog zatrzymuje się na granicy. |
| `*.homing.mpos_mm` | -5 | Dolna granica okna względem pozycji z chwili startu. |
| `*.homing.positive_direction` | false | Z `mpos_mm` wyznacza okno: od `mpos_mm` do `mpos_mm + max_travel_mm`, czyli −5…+5°. |
| `*.homing.cycle` | 0 | Oś poza `$H`. Bez krańcówek nie ma prawdziwego bazowania. |
| `*.homing.allow_single_axis` | false | Blokuje `$HX/$HY/$HZ`, które szukałyby nieistniejącej krańcówki. |
| `*.motor0.stepstick.direction_pin` | X/Z `I2SO.n:low`, Y `I2SO.n` | `:low` odwraca kierunek. Zmień po sprawdzeniu małego ruchu. |
| `stepping.idle_ms` | 255 | 255 = silniki nigdy nie zwalniają się same, aby ramię nie opadło. Inna wartość to opóźnienie w ms. |
| `stepping.engine` | I2S_STATIC | TinyBee steruje STEP/DIR/EN przez rejestr I2S; nie zmieniać. |
| `start.must_home` | true | Po starcie Alarm do czasu `$X`. Patrz [uruchomienie.md](uruchomienie.md). |

Piny `I2SO.*` i sekcja `i2so` odpowiadają oficjalnej konfiguracji TinyBee i mapie pinów Marlina (X 0/1/2, Y 3/4/5, Z 6/7/8 = EN/STEP/DIR). Nie zmieniać bez schematu płyty.

## Przelicznik

`steps_per_mm = kroki_silnika × mikrokrok × zęby_wyjścia / zęby_silnika / 360 × korekta`

Dla 200 × 8 × 32 / 9 / 360 wynik wynosi **15.802469**. Przy 1/16 — 31.604938 (wymaga fizycznej zmiany zworek). Silnik 0,9°: 400 kroków. Korekta po pomiarze: `nowe = stare × kąt_zadany / kąt_zmierzony`. Nie wpisuj ujemnych wartości; kierunek zmienia się przez `:low`.

## Zmiany na żywo

Pojedyncze wartości można zmienić bez pliku, np. `$/axes/x/max_rate_mm_per_min=60`. Znikają po restarcie, chyba że zapiszesz bieżącą konfigurację `$CD=config.yaml` — wtedy plik na płycie różni się od repo. Zalecane: zmieniać `fluidnc/config.yaml` w repo i wysyłać go narzędziem. Podgląd aktywnej konfiguracji: `$CD`.

Prąd silników/Vref i zworki mikrokroku ustawia sprzęt (TMC2209 STANDALONE). Długości członów 120/120 mm nie wchodzą do tej konfiguracji; kinematyka głowicy nie jest zaimplementowana.

Profil nie został sprawdzony ruchowo. Okno ±5° jest ograniczeniem testowym względem pozycji przy starcie, nie gwarancją braku kolizji.
