# MKS TinyBee — ramię XYZ

Marlin 2.1.2.5 dla płyty **MKS TinyBee (ESP32)**, przygotowany do sterowania trzema osiami ramienia. Repozytorium zawiera pełne źródła potrzebne do kompilacji i zaczyna się od nowej historii Git.

## Konfiguracja

- Płyta: `BOARD_MKS_TINYBEE`, środowisko PlatformIO: `mks_tinybee`.
- Sterowniki X/Y/Z: `TMC2209_STANDALONE`.
- `EXTRUDERS=0`, czujniki temperatury wyłączone.
- Brak włączonego wyświetlacza i interfejsu WWW.
- Platforma `espressif32@2.1.0`, Arduino ESP32 1.0.4.
- Zachowane nadpisanie pakietu narzędzi: `espressif/toolchain-xtensa-esp32s3@12.2.0+20230208`.

Wymagane biblioteki SPI, EEPROM, ArduinoOTA, ESPmDNS, WiFi, FS, SPIFFS i Wire dostarcza framework. PlatformIO pobiera zależności automatycznie. Obecna konfiguracja nie wymaga TMCStepper ani biblioteki wyświetlacza.

## Budowanie

Pełny przewodnik dla właściciela: [uruchomienie i obsługa projektu](docs/uruchomienie.md). Dla autora aplikacji Windows sterowanej padem: [kontrakt serial/G-code](docs/serial-protocol.md).

Do oddzielnego sprawdzenia USB i wgrywania służy [minimalny test serial bez Marlina](tools/serial-smoke-test/README.md). Wgranie testu zastępuje aplikację ramienia.

[Poprawka resetu CH340 w Windows](docs/windows-upload.md) jest włączona dla środowiska TinyBee. Wgranie i wykonanie programu minimalnego potwierdzono na sprzęcie; Marlin pozostaje bez testów ruchowych.

Firmware nie został jeszcze wgrany ani przetestowany ruchowo. Parametry ramienia edytuj w **[Marlin/RobotSettings.h](Marlin/RobotSettings.h)**; [opis wszystkich ustawień](docs/parametry.md). Domyślny profil rozruchowy: około 15,802469 impulsu/°, maks. 2°/s, przyspieszenie 10°/s², tymczasowe granice ±5° i brak automatycznego zwalniania silników. Założenie mikrokroku 1/8 wymaga sprawdzenia na sprzęcie.

Zainstaluj PlatformIO Core lub rozszerzenie PlatformIO IDE do VS Code. W VS Code otwórz główny folder repozytorium, zawierający `platformio.ini`.

```sh
pio run -e mks_tinybee
```

Wynik: `.pio/build/mks_tinybee/firmware.bin`.

Przykład wgrywania po sprawdzeniu konfiguracji urządzenia:

```sh
pio run -e mks_tinybee -t upload --upload-port COM7
pio device monitor --port COM7 --baud 250000
```

Zastąp `COM7` rzeczywistym portem płyty. Port nie jest zapisany w konfiguracji projektu.

## Ustawienia ramienia

| Oś sterownika | Element mechaniczny |
| --- | --- |
| Z | Obrót podstawy |
| X | Pierwszy przegub od podstawy |
| Y | Drugi przegub, ruch góra–dół |

Mechanizm utrzymuje głowicę w poziomie. Skoordynowany ruch przegubów X i Y pozwala zmieniać wysokość głowicy przy zachowaniu jej odległości od osi podstawy. Oznaczenia X/Y/Z w obecnym firmware odnoszą się do napędów przegubów, a nie współrzędnych kartezjańskich głowicy. W szczególności polecenie ruchu Z obraca podstawę.

Parametry ruchu są pobierane z `Marlin/RobotSettings.h`. Korekty skali, zakresy i kierunki wymagają kalibracji na sprzęcie. To sterowanie osiami przegubów; projekt nie implementuje kinematyki odwrotnej ramienia.

Instrukcja testowania i założenia mechaniczne: [docs/ramie-xyz.md](docs/ramie-xyz.md).

## Pochodzenie i licencja

Źródła pochodzą z [MarlinFirmware/Marlin](https://github.com/MarlinFirmware/Marlin), commit `47d0617f9cc6e20e146c2579b858403465450aed`, z lokalną konfiguracją TinyBee i ramienia XYZ. Zachowano oryginalne informacje o autorach w plikach oraz licencję [GPL-3.0-or-later](LICENSE).

Zmiany przygotowujące samodzielne repozytorium (21.10.2026): nowa historia Git, instrukcja budowania, przypięcie wersji nadpisanego pakietu kompilatora, usunięcie lokalnego portu COM7 oraz wykluczenie wyników kompilacji i logów.
