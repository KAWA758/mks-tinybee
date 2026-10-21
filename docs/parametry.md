# Parametry ramienia w jednym miejscu

Edytuj **`Marlin/RobotSettings.h`**. `Configuration.h` i `Configuration_adv.h` pobierają stamtąd aktywne ustawienia ruchu. Są to stałe kompilacji C/C++, a nie zmienne zmieniane na żywo. Po edycji wykonaj `pio run -e mks_tinybee` i ponownie wgraj firmware.

X = napęd pierwszego przegubu, Y = drugiego, Z = obrót podstawy. Jednostka firmware oznacza stopień obrotu wyjścia napędu. Marlin nadal używa etykiet mm; nie są to milimetry przesunięcia głowicy.

Poniżej `*` oznacza X, Y lub Z. Każda oś ma osobną wartość, nawet jeśli początkowo wszystkie są takie same.

| Parametr w RobotSettings.h | Początkowo | Znaczenie |
| --- | --- | --- |
| `ROBOT_*_MOTOR_STEPS` | 200 | Pełne kroki na obrót silnika, 360° / kąt kroku; 200 dla silnika 1,8°. |
| `ROBOT_*_MICROSTEPS` | 8 | Liczba impulsów STEP na pełny krok, zgodna z fizycznymi zworkami. Nie konfiguruje TMC przez UART. |
| `ROBOT_*_MOTOR_TEETH` | 9 | Zęby koła na silniku. |
| `ROBOT_*_OUTPUT_TEETH` | 32 | Zęby koła wyjściowego przekładni. |
| `ROBOT_*_STEP_CORRECTION` | 1.0 | Mnożnik korekty skali po pomiarze. Nowa korekta = stara × kąt zadany / zmierzony. |
| `ROBOT_*_MAX_SPEED_DPS` | 2 | Limit prędkości jednej osi w °/s; domyślne M203. |
| `ROBOT_*_MAX_ACCEL_DPS2` | 10 | Limit przyspieszenia jednej osi w °/s²; domyślne M201. |
| `ROBOT_MOVE_ACCEL_DPS2` | 10 | Domyślne przyspieszenie M204 P. |
| `ROBOT_TRAVEL_ACCEL_DPS2` | 10 | Domyślne M204 T; w tym projekcie bez ekstrudera dotyczy zwykłych ruchów G0/G1. |
| `ROBOT_JUNCTION_DEVIATION_DEG` | 0.005 | Parametr płynnego łączenia segmentów; mniejsza wartość zwykle spowalnia przejścia przez zakręty. To umowne stopnie w przestrzeni napędów, nie dokładność głowicy w mm. |
| `ROBOT_MIN_SPEED_DPS` | 0 | Minimalny feedrate dla ruchu i travel, M205 S/T; zero nie narzuca dodatkowej prędkości minimalnej. |
| `ROBOT_MIN_SEGMENT_TIME_US` | 20000 | Parametr spowalniania przy opróżnianiu bufora, M205 B, w µs. Nie ustala cyklu odczytu pada. |
| `ROBOT_*_INVERT_DIR` | X:false, Y:true, Z:false | Odwrócenie elektrycznego kierunku osi. Zmienić po sprawdzeniu małego ruchu. |
| `ROBOT_*_MIN_DEG`, `ROBOT_*_MAX_DEG` | -5, +5 | Tymczasowe okno rozruchowe względem ręcznego zera; zastąpić zmierzonymi granicami. Nie wykrywa kolizji pomiędzy członami. |
| `ROBOT_IDLE_TIMEOUT_SEC` | 0 | Czas do automatycznego zwolnienia osi. Zero wyłącza timeout, aby ramię nie opadało samo. Wymaga poprawnego prądu, chłodzenia i nadzoru. |
| `ROBOT_SERIAL_BAUD` | 250000 | Prędkość komunikacji uruchomionego firmware. Taką samą ustaw w aplikacji i monitorze; prędkość uploadu jest osobnym parametrem PlatformIO. |
| `ROBOT_*_DRIVER` | TMC2209_STANDALONE | Typ sterownika. Zmiana na UART wymaga także zmian sprzętu i konfiguracji; samo przepisanie nazwy nie wystarczy. |
| `ROBOT_HOME_SPEED_DPM` | 30 | Rezerwowa prędkość homingu w °/min. G28 pozostaje niedopuszczone do użycia bez przygotowania krańcówek. |
| `ROBOT_*_HOME_DIR` | -1 | Kierunek homingu: -1 do MIN, +1 do MAX. Nie jest kierunkiem dodatniego ruchu. |
| `ROBOT_HOME_BUMP_DEG` | 0 | Wielkość odjazdu do powtórnego bazowania; zero pomija drugi najazd. |
| `ROBOT_HOME_BUMP_DIVISOR` | 2 | Dzielnik prędkości powtórnego najazdu, gdy bump jest większy od zera. |

`ROBOT_*_STEPS_PER_DEG` są obliczane automatycznie; nie edytuj ich wzoru:

`kroki_na_stopień = MOTOR_STEPS × MICROSTEPS × OUTPUT_TEETH / MOTOR_TEETH / 360 × STEP_CORRECTION`

Dla bieżących założeń wynik wynosi około **15,802469 impulsu/°**. Zwiększenie mikrokroku z 8 do 16 wymaga fizycznej zmiany sprzętu i wartości `MICROSTEPS`; wynik podwoi się. Automatyczna interpolacja TMC do 256 nie wymaga wpisania 256.

## Jak zmieniać

- Silnik 0,9°: zmień `MOTOR_STEPS` odpowiedniej osi na 400.
- Inne koła: wpisz faktyczną liczbę zębów. Nie dopisuj dodatkowo tego samego przełożenia w `STEP_CORRECTION`.
- Ruch w przeciwną stronę: zmień `INVERT_DIR`. Nie stosuj ujemnej korekty kroków.
- Większa prędkość: zwiększaj stopniowo `MAX_SPEED_DPS`, po testach mechaniki. Zadana prędkość F w G-code jest w °/min; F30 oznacza 0,5°/s. Przy wielu osiach F dotyczy długości wektora ruchu napędów.
- Zakres mechaniczny: najpierw ustal powtarzalne zero, potem granice osi i niedozwolone kombinacje X/Y. Nie wpisuj tu po prostu kąta między członami bez poznania relacji do napędu.

Komendy M92, M203, M201, M204, M205 i M84 S mogą nadpisać odpowiednie wartości podczas sesji. Wyłączone EEPROM oznacza, że reset przywraca stałe wgrane z RobotSettings.h; runtime nie aktualizuje pliku. Aplikacja powinna po połączeniu sprawdzić M503 i nie wgrywać automatycznie starego profilu.

Prąd silników/Vref i zworki ustawia sprzęt. Długości członów 120/120 mm są danymi przyszłego modelu kinematyki, a nie przelicznikiem kroków. Ten firmware nadal nie realizuje kinematyki głowicy.

Profil nie został sprawdzony ruchowo. Granice ±5° są ograniczeniem testowym, nie gwarancją braku kolizji w dowolnym fizycznym ustawieniu ramienia. G92 zmienia układ współrzędnych i przesuwa interpretację granic; stosuj je tylko przy świadomym ustalaniu odniesienia.
