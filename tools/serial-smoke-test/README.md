# Minimalny test USB / ESP32

Samodzielny projekt PlatformIO, bez kodu Marlina. Raz na sekundę wypisuje przez UART0 `TINYBEE_SERIAL_TEST heartbeat=... uptime_ms=...`. Nie konfiguruje GPIO napędów, grzałek ani diod. Nie odbiera G-code i nie służy do sterowania ramieniem.

Wgranie zastępuje działającą aplikację oraz tablicę partycji; nie jest aktualizacją konfiguracji Marlina. Podeprzyj ramię i zapewnij brak możliwości niekontrolowanego ruchu podczas resetów. Nie jest to pełne kasowanie flash.

Z głównego folderu repozytorium:

```powershell
pio run -d tools/serial-smoke-test
pio run -d tools/serial-smoke-test -t upload --upload-port COM13
pio device monitor --port COM13 --baud 115200
```

COM13 jest przykładem — sprawdź `pio device list` (ostatni udany test: COM14). Monitor i uploader nie mogą używać portu jednocześnie. Oba używają tu 115200 baud. Stałe komunikacji i interwału są w `src/main.cpp`; szybkość monitora w `platformio.ini` musi zgadzać się z programem.

Projekt korzysta z [obejścia resetu CH340 w Windows](../../docs/windows-upload.md), które umożliwiło poprawne wgranie na diagnozowanym komputerze. Pozostałe adaptery/systemy używają standardowego resetu.

Sukces wymaga zakończonego zapisu i weryfikacji przez esptool oraz kolejnych komunikatów heartbeat po restarcie. Jeśli błąd występuje już na `Connecting` / `Wrong boot mode`, program nie został jeszcze uruchomiony: przyczyna leży przed etapem wykonania aplikacji.

Powrót do projektu ramienia (z głównego folderu repo):

```powershell
pio run -e mks_tinybee -t upload --upload-port COM13
pio device monitor --port COM13 --baud 250000
```

Po powrocie ponownie ustal fizyczną pozycję odniesienia. Wyniki kompilacji `.pio` pozostają ignorowane w Git.

## Weryfikacja 25.10.2026

**Po dodaniu jednoczesnego resetu DTR/RTS: upload na COM14 zakończony SUCCESS przy 115200 baud, zapis zweryfikowany przez esptool, po restarcie odczytano heartbeat 60, 61, 62, 63.** Płyta zgłosiła ESP32-D0WD rev. 1 i flash 8 MB. Sterownik CH340: 3.9.2024.9. Szczegóły integracji i powrotu do Marlina: [windows-upload.md](../../docs/windows-upload.md).

### Wcześniejsze próby bez obejścia resetu

Program skompilował się: Flash 216831 B, RAM 15444 B. Próba uploadu na COM13, przy CH340 3.7.2022.1 i esptool 3.0, zakończyła się `Failed to connect to ESP32: Timed out waiting for packet header` na etapie `Connecting`, przed zapisem flash. Nie zweryfikowano wykonania heartbeat na płycie. Ten sam rodzaj błędu występował przy Marlinie, co wyklucza kod aplikacji Marlin jako przyczynę tego konkretnego błędu połączenia; nie ustala jeszcze przyczyny problemu resetu/transportu.

### Porównanie z działającym laptopem

Według notatki przekazanej przez właściciela na innym komputerze zadziałały: Windows 11 build 26200, CH340 3.9.2024.9, esptool 3.0, upload 460800 baud, flash 8 MB / DIO / 40 MHz, monitor 115200 baud, PlatformIO 6.2.0, espressif32 2.1.0, Python 3.14.6 i pyserial 3.5.

Na diagnozowanym komputerze przywrócono oryginalny sterownik CH340 3.9.2024.9 (potwierdzony w Plug and Play). Próba na COM13 z uploadem 460800, DIO i 40 MHz nadal zakończyła się timeoutem synchronizacji. Osobne sprawdzenie esptool 3.0 pod przenośnym Pythonem 3.14.6 oraz wgranie z procesu administratora także nie uzyskały połączenia. Żadna z tych prób nie rozpoczęła zapisu firmware.

Zmiana samej wersji sterownika, Pythona lub prędkości uploadu nie została potwierdzona jako rozwiązanie. Esptool 3.0 rozpoczyna synchronizację z prędkością nie większą niż 115200 baud; na 460800 przełącza się później. Problem wejścia w bootloader rozwiązano następnie przez jednoczesny reset, opisany powyżej. Pakietów sterowników i lokalnych konfiguracji diagnostycznych nie dołączono do repo.
