# Minimalny test USB / ESP32

Samodzielny projekt PlatformIO, bez kodu Marlina. Raz na sekundę wypisuje przez UART0 `TINYBEE_SERIAL_TEST heartbeat=... uptime_ms=...`. Nie konfiguruje GPIO napędów, grzałek ani diod. Nie odbiera G-code i nie służy do sterowania ramieniem.

Wgranie zastępuje działającą aplikację oraz tablicę partycji; nie jest aktualizacją konfiguracji Marlina. Podeprzyj ramię i zapewnij brak możliwości niekontrolowanego ruchu podczas resetów. Nie jest to pełne kasowanie flash.

Z głównego folderu repozytorium:

```powershell
pio run -d tools/serial-smoke-test
pio run -d tools/serial-smoke-test -t upload --upload-port COM13
pio device monitor --port COM13 --baud 115200
```

COM13 jest przykładem — sprawdź `pio device list`. Monitor i uploader nie mogą używać portu jednocześnie. Oba używają tu 115200 baud. Stałe komunikacji i interwału są w `src/main.cpp`; szybkość monitora w `platformio.ini` musi zgadzać się z programem.

Sukces wymaga zakończonego zapisu i weryfikacji przez esptool oraz kolejnych komunikatów heartbeat po restarcie. Jeśli błąd występuje już na `Connecting` / `Wrong boot mode`, program nie został jeszcze uruchomiony: przyczyna leży przed etapem wykonania aplikacji.

Powrót do projektu ramienia (z głównego folderu repo):

```powershell
pio run -e mks_tinybee -t upload --upload-port COM13
pio device monitor --port COM13 --baud 250000
```

Po powrocie ponownie ustal fizyczną pozycję odniesienia. Wyniki kompilacji `.pio` pozostają ignorowane w Git.

## Wynik próby 25.10.2026

Program skompilował się: Flash 216831 B, RAM 15444 B. Próba uploadu na COM13, przy CH340 3.7.2022.1 i esptool 3.0, zakończyła się `Failed to connect to ESP32: Timed out waiting for packet header` na etapie `Connecting`, przed zapisem flash. Nie zweryfikowano wykonania heartbeat na płycie. Ten sam rodzaj błędu występował przy Marlinie, co wyklucza kod aplikacji Marlin jako przyczynę tego konkretnego błędu połączenia; nie ustala jeszcze przyczyny problemu resetu/transportu.
