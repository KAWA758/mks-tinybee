# Obsługa projektu i pierwsze uruchomienie (FluidNC)

## Stan projektu

Repo przeszło z Marlina 2.1.2.5 na FluidNC v4.1.1. Marlin był wgrany 25.10.2026 i odpowiadał na M115/M503/M114; ruchów nie wykonywano. **FluidNC nie został jeszcze wgrany na płytę ani przetestowany ruchowo.** `fluidnc/config.yaml` to profil rozruchowy, sprawdzony tylko względem źródeł FluidNC v4.1.1.

Potwierdzone dane: człony 120/120 mm; Z = podstawa, X = pierwszy napęd przegubu, Y = drugi; mechaniczne poziomowanie głowicy; brak enkoderów i krańcówek. Silnik STEPPERONLINE 17HE15-1504S: 1,8°, 1,50 A, 2,30 Ω, 4,00 mH, 0,42 Nm. Potwierdzić, że wszystkie trzy silniki są tego typu.

## Zworki i przelicznik

TMC2209: MS1=MS2=0 daje 1/8, MS1=MS2=1 daje 1/16. Stan „OFF” na płycie musi odpowiadać tym poziomom na konkretnym module; nie znamy producenta modułu. Dla 1/8 i przekładni 9:32: `steps_per_mm = 15.802469` (impulsy/°). Prąd 1,50 A z karty nie oznacza Vref 1,50 V; w trybie STANDALONE prąd ustawia potencjometr modułu.

## Narzędzia

Wymagany PlatformIO (VS Code lub Core). Używamy jego Pythona (ma pyserial) i esptool 3.0, z którym potwierdzono [obejście resetu CH340](windows-upload.md). Raz:

```powershell
$py = "$env:USERPROFILE\.platformio\penv\Scripts\python.exe"
& $py -m pip install xmodem
```

`tools/fluidnc.py` pobiera `fluidnc-v4.1.1-posix.zip` z GitHub do `.fluidnc/` (ignorowane przez Git) i sprawdza SHA-256 przed wgraniem.

## Pierwsza instalacja

1. Wyłącz zasilanie silników albo odłącz silniki przy wyłączonym zasilaniu. Podeprzyj mechanizm. Zamknij monitory portu.
2. Ustal port: `pio device list` (ostatnio COM14).
3. Wgraj FluidNC, kasując Marlina, z systemem plików WebUI:

   ```powershell
   & $py tools\fluidnc.py flash --port COM14 --erase --fs
   ```

   Oczekuj `TinyBee: simultaneous Windows CH340 DTR/RTS reset` i weryfikacji hash dla każdego obrazu.
4. Wyślij konfigurację ramienia (restartuje płytę i wypisuje log startowy):

   ```powershell
   & $py tools\fluidnc.py upload-config --port COM14
   ```

   W logu nie może być `Config error` ani `ConfigAlarm`. Dla pewności w terminalu: `$SS` (log startu) i `$CD` (aktywna konfiguracja).
5. **WiFi:** wersja wifi uruchamia punkt dostępu `FluidNC` z domyślnym hasłem `12345678`. Każdy w zasięgu mógłby sterować ramieniem. Od razu ustaw własne hasło `$AP/Password=...` albo wyłącz radio `$WiFi/Mode=Off`; następnie `$Bye`.

Terminal: `pio device monitor --port COM14 --baud 115200`. Tylko jeden program może mieć otwarty port.

Kolejne aktualizacje firmware: `flash` bez `--erase --fs` (zachowuje `config.yaml` i ustawienia), albo OTA przez WebUI plikiem `.fluidnc/v4.1.1/wifi/firmware.bin`. `--fs` nadpisuje system plików i **usuwa `config.yaml` z płyty** — po nim zawsze `upload-config`.

## Pozycja odniesienia bez krańcówek

FluidNC liczy pozycję maszynową od zera w chwili startu ESP32. Konfiguracja ma `must_home: true`, więc po każdym starcie płyta jest w stanie `Alarm` (ALARM:14 Unhomed) i odrzuca ruch oraz jog. Procedura:

1. W stanie Alarm: `$MD` zwalnia silniki. Podeprzyj ramię i ustaw ręcznie oznaczoną pozycję odniesienia.
2. `$Bye` — restart; pozycja odniesienia staje się MPos 0,0,0. Po starcie sterowniki mogą od razu załączyć silniki — trzymaj podparcie.
3. `?` powinno pokazać `<Alarm|MPos:0.000,0.000,0.000|...>`.
4. `$X` — świadome potwierdzenie, że ramię stoi w pozycji odniesienia. Od tej chwili dozwolony ruch w oknie −5…+5° na każdej osi.

Nie używaj `$X` po alarmie w trakcie ruchu (ALARM:3, Ctrl-X podczas ruchu) bez ponownego ustalenia odniesienia: pozycja mogła zostać utracona. `$H` nic nie przesuwa i kończy się błędem — to oczekiwane. Otwarcie portu przez program ustawiający DTR/RTS może zrestartować ESP32; wtedy wróć do kroku 1.

## Pierwszy ruch — dopiero po potwierdzeniu sprzętu

Wymaga trzech jednakowych silników 1,8°, mikrokroku 1/8 i przekładni 9:32. Od włączenia napędów nie przestawiaj ramienia ręcznie.

Najpierw sama podstawa, pół stopnia z prędkością 0,5°/s:

```
$J=G91 G21 Z0.5 F30
?
$J=G91 G21 Z-0.5 F30
```

Jog można przerwać w każdej chwili bajtem `0x85` (anulowanie jog) albo `!` (wstrzymanie). Jeśli ruch nie odpowiada oczekiwaniu — przerwij kalibrację; kierunek zmienia `:low` przy `direction_pin`, skalę `steps_per_mm`. X i Y testuj osobno po zapewnieniu podparcia.

Nie wyłączaj `soft_limits`, żeby obejść nieznaną geometrię. Okno ±5° to ograniczenie rozruchowe, nie zmierzony zakres mechaniki.

## Dalsza kalibracja

Zmierz rzeczywisty kąt po znanym obrocie; `nowe_steps = stare_steps × kąt_zadany / kąt_zmierzony`. Ustal znaki napędów, docelowe zero, zakresy i kolizje zależne od pary X/Y. Wpisz wartości do `fluidnc/config.yaml` (zakres: `mpos_mm` i `max_travel_mm`, patrz [parametry.md](parametry.md)) i wyślij `upload-config`.

`idle_ms: 255` — silniki nie zwalniają się same; kontroluj temperaturę. `$MD` zwalnia napędy i ramię może opaść.

## Praca nad repo

```powershell
git switch -c config/nazwa-zmiany
```

Po zmianach: test na sprzęcie, opis w dokumentacji, commit i pull request. Zmiana jednostek, prędkości portu lub zachowania komend wymaga aktualizacji [serial-protocol.md](serial-protocol.md) i uzgodnienia z autorem aplikacji. Nie commituj `.fluidnc/`, `.pio`, logów ani haseł WiFi.

Źródła: [FluidNC wiki](https://github.com/bdring/FluidNC/wiki), [TMC2209, tabela MS1/MS2](https://www.analog.com/media/en/technical-documentation/data-sheets/tmc2209_datasheet_rev1.08.pdf).
