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

Parametry w `Marlin/Configuration.h` i `Marlin/Configuration_adv.h` zachowano z wcześniejszego projektu. Kroki, zakresy, prędkości i przyspieszenia wymagają dopasowania do mechaniki ramienia. To sterowanie osiami przegubów; projekt nie implementuje kinematyki odwrotnej ramienia.

Instrukcja testowania i założenia mechaniczne: [docs/ramie-xyz.md](docs/ramie-xyz.md).

## Pochodzenie i licencja

Źródła pochodzą z [MarlinFirmware/Marlin](https://github.com/MarlinFirmware/Marlin), commit `47d0617f9cc6e20e146c2579b858403465450aed`, z lokalną konfiguracją TinyBee i ramienia XYZ. Zachowano oryginalne informacje o autorach w plikach oraz licencję [GPL-3.0-or-later](LICENSE).

Zmiany przygotowujące samodzielne repozytorium (21.10.2026): nowa historia Git, instrukcja budowania, przypięcie wersji nadpisanego pakietu kompilatora, usunięcie lokalnego portu COM7 oraz wykluczenie wyników kompilacji i logów.
