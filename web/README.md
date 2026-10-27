# Aplikacja WWW do sterowania ramieniem

Strona w przeglądarce łączy się z płytą przez USB (Web Serial) i wysyła jog FluidNC zgodnie z [kontraktem serial](../docs/serial-protocol.md). Bez serwera aplikacji, bez WiFi i bez kompilacji.

## Uruchomienie (Windows)

Wymagany **Chrome lub Edge** (Firefox i Safari nie mają Web Serial). Zamknij `pio device monitor`, bo port może mieć otwarty tylko jeden program. Z głównego folderu repo:

```powershell
$py = "$env:USERPROFILE\.platformio\penv\Scripts\python.exe"
& $py -m http.server 8000 --bind 127.0.0.1 -d web
```

Otwórz **http://localhost:8000** i kliknij **Connect**, a potem wybierz `USB-SERIAL CH340`. Web Serial działa tylko z `localhost` lub HTTPS, a nie z pliku otwartego dwuklikiem. Serwer zatrzymuje Ctrl+C w PowerShell.

**Symulator bez płyty:** http://localhost:8000/?sim. To fałszywy FluidNC z tym samym oknem ±5°, do nauki obsługi i dla autora aplikacji.

## Obsługa

1. Po połączeniu i po każdym restarcie stan to **Alarm**, a panel *Set the reference position* prowadzi przez `$MD` → ustawienie ramienia → `$Bye` → `$X`. Każdy krok wymaga potwierdzenia.
2. **Enable motion** uzbraja sterowanie. Wyłącza się samo przy alarmie, STOP, utracie fokusu okna, ukryciu karty i rozłączeniu.
3. Przytrzymaj **−/+** przy przegubie. Puszczenie wysyła anulowanie jog (`0x85`). Suwak ustawia prędkość; jego maksimum to `max_rate_mm_per_min` odczytane z płyty.
4. **Pad** (standardowe mapowanie, np. Xbox): przytrzymaj **LB** lub **RB** (dead man), lewa gałka ↔ = podstawa, lewa ↕ = przegub 1, prawa ↕ = przegub 2. Dodatkowo musi być włączone *Enable motion*.
5. **STOP** (także Spacja/Esc) wysyła anulowanie jog, a podczas ruchu G-code również `!`. Rozbraja sterowanie.
6. **Go to 0** wykonuje jog absolutny do pozycji odniesienia z ustawioną prędkością. Przerywa go STOP.
7. Konsola przyjmuje dowolne komendy (`$SS`, `$CD`, `?`). **Reset** (Ctrl-X) zatrzymuje kroki natychmiast i zwykle powoduje utratę pozycji.

Paski pod pozycją pokazują okno `soft_limits` odczytane z płyty (`$/axes/*/…`). Po zmianie `config.yaml` i `upload-config` wystarczy ponowne połączenie.

## Ograniczenia

- Programowy STOP nie zastępuje sprzętowego wyłącznika. Przy testach trzymaj rękę przy zasilaniu.
- Przy wyrwaniu USB płyta dokończy już wysłane przyrosty, czyli maks. 3 × 0,1 s ruchu.
- Tryb przegubowy: przyciski i gałki sterują napędami, nie pozycją głowicy.

## Pliki i testy

| Plik | Rola |
| --- | --- |
| `index.html`, `style.css` | Interfejs |
| `app.js` | Port szeregowy, kolejka `ok`, pętla jog co 100 ms, pad, UI |
| `grbl.js` | Czysta logika: parsowanie odpowiedzi, linie `$J=`, mapowanie pada |
| `sim.js` | Symulator FluidNC dla `?sim` |

Testy logiki: `node --test tools/tests/grbl.test.mjs`. Interfejs sprawdzono w headless Chrome na symulatorze. Strona wysyła komendy z liczeniem znaków (maks. 127 niepotwierdzonych bajtów): bufor odbiorczy FluidNC ma 256 B, a jego przepełnienie blokowało odpowiedzi płyty; symulator ma ten sam limit. Strona nie zmienia linii DTR/RTS po otwarciu portu: ich kolejna zmiana w Chrome resetowała ESP32 przez obwód auto-resetu (jak w [windows-upload.md](../docs/windows-upload.md)).
