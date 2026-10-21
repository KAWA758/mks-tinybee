# Obsługa projektu i pierwsze uruchomienie

## Stan projektu

Firmware jest kompilowalny, ale według potwierdzenia właściciela nie został jeszcze wgrany na płytę. Nie przeprowadzono testów ruchu na sprzęcie. Konfiguracja nadal ma drukarkowe wartości kroków, prędkości, przyspieszeń i granic; nie jest gotowym profilem ruchowym ramienia.

Potwierdzone dane: człony 120/120 mm; Z = podstawa, X = pierwszy napęd przegubu, Y = drugi napęd przegubu; mechaniczne poziomowanie głowicy; brak enkoderów. Silnik z dostarczonej karty STEPPERONLINE 17HE15-1504S: 1,8° (200 pełnych kroków/obrót), 1,50 A, 2,30 Ω, 4,00 mH, moment trzymający 0,42 Nm. Potwierdzić, że wszystkie trzy silniki są tego samego typu.

## Zworki i przelicznik

Nie zmieniaj zworek na chybił trafił. Dla samego układu TMC2209 MS1=0 i MS2=0 daje 1/8 kroku, a MS1=1 i MS2=1 daje 1/16. OFF na płycie musi odpowiadać tym poziomom na konkretnym module; nie znamy jeszcze producenta i rewizji modułu. Nie zakładaj, że trzy zworki działają jak w A4988. Interpolacja do 256 mikrokroków nie zmienia liczby impulsów STEP potrzebnych do ruchu.

Dla potwierdzonego mikrokroku 1/8 oraz przekładni 9 zębów na silniku / 32 zęby na wyjściu:

`steps_per_degree = (360 / 1.8) × 8 × (32 / 9) / 360 = 15.802469`

Przy 1/16 wartość wynosi 31.604938. To przelicznik kąta napędzanego wyjścia przekładni, a nie automatycznie kąta między członami ani współrzędnej głowicy. Potwierdź przełożenie dla każdej osi.

Prąd 1,50 A z karty nie jest poleceniem ustawienia Vref na 1,50 V. W trybie STANDALONE prąd ustala moduł, zwykle potencjometrem; potrzebne są jego dokumentacja, rezystory pomiarowe i chłodzenie. Ustawienie prądu przez UART w tym projekcie nie działa.

## Pobranie i praca nad kodem

```powershell
git clone https://github.com/KAWA758/mks-tinybee.git
cd mks-tinybee
git switch -c firmware/nazwa-zmiany
```

Otwórz ten główny folder w VS Code. Zainstaluj PlatformIO IDE. Pliki do typowych zmian: `Marlin/Configuration.h`, `Marlin/Configuration_adv.h`, `ini/esp32.ini`. Zachowaj przypięte wersje narzędzi. Nie aktualizuj frameworka ESP32 niezależnie od Marlina.

```powershell
pio run -e mks_tinybee
pio device list
```

W terminalu PlatformIO polecenie `pio` jest dostępne. W innym PowerShell można zamiast niego użyć `& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe"`.

Po zmianach firmware: kompilacja, opis założeń w dokumentacji, commit i pull request. Nie commituj `.pio`, logów, tokenów ani lokalnych ustawień portu COM. Zmiana jednostek, baudrate albo zachowania komend wymaga równoczesnej aktualizacji `serial-protocol.md` i uzgodnienia z autorem aplikacji.

## Wgranie

1. Wyłącz zasilanie przed zmianą okablowania, zworek lub modułów. Nie odłączaj silników od zasilanych sterowników. Podeprzyj mechanizm.
2. Pierwsze wgranie wykonaj bez możliwości niekontrolowanego ruchu ramienia, np. przy odłączonych silnikach, odłączonych wcześniej bez zasilania.
3. Podłącz USB i ustal port przez `pio device list`. Zamknij aplikację sterującą i monitory portu.
4. Wgraj, zastępując COM7 rzeczywistym portem:

```powershell
pio run -e mks_tinybee -t upload --upload-port COM7
pio device monitor --port COM7 --baud 250000
```

Wgrywanie używa 115200 baud; komunikacja z działającym Marlinem używa 250000 baud. Jeśli upload nie działa, zachowaj pełny komunikat błędu; nie zmieniaj od razu wersji bibliotek.

## Pierwsza sesja bez ruchu

Wyślij osobno `M115`, `M503`, `M114`. Oczekuj odpowiedzi oraz `ok`. Odczyt M114 jest pozycją wyliczoną, nie pomiarem fizycznym. EEPROM_SETTINGS jest wyłączone: M500/M501 nie są sposobem zapisywania i przywracania kalibracji w tym buildzie.

## Pierwszy ruch — dopiero po potwierdzeniu sprzętu

Poniższy przykład wymaga trzech jednakowych silników 1,8°, mikrokroku 1/8 i przełożenia 9:32 na każdej osi. Nie wysyłaj go automatycznie przy każdym połączeniu. Parametry są ostrożnymi wartościami startowymi do testu, a nie zweryfikowanymi limitami mechanizmu.

Najpierw ustaw ręcznie bezpieczną, oznaczoną pozycję z luzem na mały ruch w obie strony i ponownie włącz napędy. Zapisz jej fizyczne położenie; robocze zero nie jest zerem geometrii z rysunku. Od chwili włączenia napędów nie przestawiaj ramienia ręcznie.

Wyślij po jednej linii, czekając na `ok`:

```gcode
M92 X15.802469 Y15.802469 Z15.802469
M203 X2 Y2 Z2
M201 X10 Y10 Z10
M204 P10 T10
G21
G90
G92 X0 Y0 Z0
```

Po tym profilu 1 jednostka oznacza 1° obrotu napędu. Marlin nadal opisuje ją jako mm. M203 jest w jednostkach/s, M201/M204 w jednostkach/s², a F w jednostkach/min. Sprawdź M503 przed ruchem.

Najpierw sprawdź samą podstawę: `G91`, następnie `G1 Z0.5 F30`, następnie `M400`. Dopiero po zakończeniu i ocenie fizycznego ruchu wróć przez `G1 Z-0.5 F30`, `M400`, `G90`. Daje to pół stopnia przy zadanej prędkości 0,5°/s. Jeśli ruch nie odpowiada oczekiwaniu, przerwij kalibrację.

X i Y testuj osobno dopiero po zapewnieniu podparcia i sprawdzeniu kolizji mechanizmu. Nie uruchamiaj G28 bez działającego, skonfigurowanego bazowania. Nie wyłączaj globalnie limitów M211 w celu obejścia nieznanej geometrii. Obecne domyślne granice 0…200 nie są potwierdzonymi zakresami ramienia.

Po resecie trzeba ponownie zastosować profil i ustalić pozycję odniesienia. Po M18/M84, utracie kroków lub przestawieniu ręcznym pozycja fizyczna jest nieznana. Napędy obecnie wyłączają się po 120 s bezczynności; ramię może opaść. Dla podpartej, nadzorowanej sesji można użyć `M84 S0`, lecz trzeba kontrolować temperaturę i świadomie zakończyć sesję.

## Dalsza kalibracja

Zmierzyć rzeczywisty kąt po zadaniu znanego małego obrotu. Korekta: `nowe_steps = stare_steps × kąt_zadany / kąt_zmierzony`. Oddzielnie ustalić znaki napędów, zera geometrii, zakresy oraz kolizje zależne od pary X/Y. Dopiero zweryfikowane wartości przenieść do domyślnych ustawień firmware.

Źródła: [TMC2209, tabela konfiguracji MS1/MS2](https://www.analog.com/media/en/technical-documentation/data-sheets/tmc2209_datasheet_rev1.08.pdf), [polecenia Marlina](https://marlinfw.org/meta/gcode/).
