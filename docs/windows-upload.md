# Wgrywanie TinyBee przez CH340 w Windows

## Wynik diagnostyki 25.10.2026

Na diagnozowanym komputerze standardowy reset esptool uruchamiał ESP32 w normalnym trybie (`boot:0x13`), a nie w bootloaderze. Program bez Marlina także nie dawał się wgrać. Zmiana sterownika CH340 3.9 na 3.7, esptool 3.0 na 5.6, Pythona 3.11 na 3.14.6, portu USB i podniesienie uprawnień nie rozwiązały problemu.

Jednoczesna zmiana DTR/RTS przez `IOCTL_SERIAL_SET_MODEM_CONTROL` dała `boot:0x3`, tryb download i poprawną identyfikację ESP32. Następnie standardowe PlatformIO z dodanym launcherem wgrało projekt `tools/serial-smoke-test` na COM14 przy 115200 baud. Esptool zweryfikował zapisane dane, a odczyt serial potwierdził kolejne heartbeat. Przywrócony sterownik 3.9.2024.9 pozostał aktywny.

Wynik wskazuje na wrażliwość sekwencyjnego resetu na tym zestawie komputer/USB/płyta. Nie mierzono oscyloskopem czasów ani napięć; nie ustalono, który konkretnie element powoduje różnicę między komputerami. Nie ma podstaw, żeby przypisywać ten błąd kodowi Marlina albo samemu numerowi wersji sterownika.

## Jak działa obejście

`buildroot/share/PlatformIO/scripts/tinybee_upload.py` przekierowuje istniejący uploader `esptool.py` do `tools/tinybee_esptool.py`. Zachowuje argumenty, pliki, adresy pamięci i weryfikację oryginalnego esptool 3.0. Nie modyfikuje zainstalowanych pakietów PlatformIO.

Wyłącznie na Windows i dla CH340 VID:PID `1A86:7523` launcher odczytuje rejestr sterowania modemem. Jeśli jego układ odpowiada znanym stanom DTR/RTS i nie ma innych ustawionych bitów, wykonuje przejścia 2 → 1 → 0, bez stanu pośredniego między resetem a wejściem w download. Synchronizacja i zapis są następnie wykonywane przez oryginalny esptool.

Na innych systemach, adapterach oraz przy nieobsługiwanym IOCTL/nieznanym stanie rejestru używany jest standardowy reset. Inne protokoły uploadu nie są podmieniane. Obsługa dotyczy przypiętego esptool 3.0 z tego projektu; aktualizacja narzędzi wymaga ponownej weryfikacji launchera.

Rejestr MCR ma układ zależny od sterownika, dlatego nie należy kopiować zapisu tych wartości na dowolny adapter. [Dokumentacja Microsoft](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddser/ni-ntddser-ioctl_serial_get_modem_control).

## Użycie

Obejście jest dołączone do środowiska `mks_tinybee` i projektu testowego. Wybierz rzeczywisty port, aktualnie COM14:

```powershell
pio run -d tools/serial-smoke-test -t upload --upload-port COM14
pio device monitor --port COM14 --baud 115200
```

Na płycie po potwierdzonej próbie działa test serial, który nie obsługuje G-code. Aby przywrócić Marlin, zamknij monitor i wgraj z głównego folderu repo:

```powershell
pio run -e mks_tinybee -t upload --upload-port COM14
pio device monitor --port COM14 --baud 250000
```

Marlin z tą integracją jest sprawdzany kompilacyjnie; potwierdzony zapis i wykonanie na sprzęcie dotyczą programu minimalnego. Po wgraniu Marlina ponownie ustal fizyczne odniesienie ramienia.

Testy logiki resetu (bez płyty):

```powershell
python -m unittest discover -s tools/tests -v
```
