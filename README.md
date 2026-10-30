# MKS TinyBee — ramię XYZ (FluidNC)

Konfiguracja [FluidNC](https://github.com/bdring/FluidNC) **v4.1.1** dla płyty **MKS TinyBee (ESP32)**, sterującej trzema napędami przegubów ramienia. Repo nie zawiera kodu firmware: używa oficjalnego wydania FluidNC (przypięta wersja i suma SHA-256) i własnego pliku konfiguracji.

| Plik | Rola |
| --- | --- |
| [fluidnc/config.yaml](fluidnc/config.yaml) | Jedyne miejsce parametrów ramienia: piny, kroki/°, prędkości, granice. |
| [tools/fluidnc.py](tools/fluidnc.py) | Pobranie wydania, wgranie przez USB z poprawką CH340, wysłanie `config.yaml`. |
| [web/](web/README.md) | Aplikacja WWW: sterowanie przegubami z przeglądarki (USB, Web Serial) i padem. |
| [docs/uruchomienie.md](docs/uruchomienie.md) | Pierwsza instalacja, ustalanie odniesienia, pierwszy ruch. |
| [docs/parametry.md](docs/parametry.md) | Opis każdego ustawienia w `config.yaml`. |
| [docs/serial-protocol.md](docs/serial-protocol.md) | Kontrakt dla aplikacji Windows sterowanej padem. |
| [docs/ramie-xyz.md](docs/ramie-xyz.md) | Mechanika, przeliczniki, brak krańcówek. |
| [docs/windows-upload.md](docs/windows-upload.md) | Obejście resetu CH340 w Windows. |

## Przypisanie osi

| Oś FluidNC | Element mechaniczny |
| --- | --- |
| Z | Obrót podstawy |
| X | Pierwszy przegub od podstawy |
| Y | Drugi przegub, ruch góra–dół |

1 jednostka = 1° obrotu wyjścia przekładni (FluidNC opisuje ją jako mm). To sterowanie przegubami; kinematyka głowicy nie jest zaimplementowana. Z nie oznacza wysokości.

## Szybki start

Wymagany PlatformIO (dostarcza Python z pyserial i esptool 3.0). W PowerShell, z głównego folderu repo:

```powershell
$py = "$env:USERPROFILE\.platformio\penv\Scripts\python.exe"
& $py -m pip install xmodem
& $py tools\fluidnc.py flash --port COM14 --erase --fs
& $py tools\fluidnc.py upload-config --port COM14
```

`--erase --fs` tylko przy pierwszej instalacji (kasuje Marlina i zapisuje WebUI). Później zmiany parametrów: edycja `fluidnc/config.yaml` i samo `upload-config`; bez kompilacji. Szczegóły i zasady bezpieczeństwa: [uruchomienie.md](docs/uruchomienie.md).

## Stan

- Konfiguracja: profil rozruchowy, około 15,802469 impulsu/°, maks. 2°/s, 10°/s², okno ±5° wokół pozycji z chwili startu, silniki bez automatycznego zwalniania.
- Mikrokrok 1/8, kierunki i skala wszystkich osi nadal wymagają pomiaru.
- FluidNC wgrany na płytę (COM3); jog podstawy i okno ±5° działają na sprzęcie.
- Testy: `python -m unittest discover -s tools/tests -v` oraz `node --test tools/tests/grbl.test.mjs`.

## Historia: Marlin

Do commita `c350a37` repo zawierało Marlin 2.1.2.5. Wgrano go 25.10.2026 (commit `2e22719`) przez COM14 i potwierdzono M115/M503/M114; ruchów nie testowano. Przejście na FluidNC wynika z ograniczeń sterowania padem: HAL ESP32 Marlina nie obsługuje EMERGENCY_PARSER, więc M410/M112 czekały w kolejce. FluidNC ma natychmiastowe komendy czasu rzeczywistego (`!`, Ctrl-X, anulowanie jog `0x85`, raport `?`), jog `$J=` z ograniczeniem do granic oraz konfigurację bez kompilacji. Źródła Marlina są dostępne w historii Git.

## Licencja

FluidNC i Marlin są objęte [GPL-3.0](LICENSE). Pliki tego repo udostępniono na tej samej licencji.
