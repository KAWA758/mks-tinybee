# Kontrakt aplikacja Windows — firmware, wersja 0.2 (FluidNC)

Status: kontrakt do implementacji i testów na symulatorze; FluidNC nie był jeszcze testowany na płycie. Wersja 0.1 dotyczyła Marlina i jest nieaktualna (historia Git).

## Podział odpowiedzialności

Firmware (FluidNC v4.1.1): impulsy STEP/DIR, planowanie ruchu, limity prędkości/przyspieszeń, okno `soft_limits`, natychmiastowe komendy czasu rzeczywistego. Aplikacja: pad, mapowanie wejść, potwierdzenie odniesienia, kontrola kolizji X/Y, generowanie jog i serial.

Tryb przegubowy: X = napęd pierwszego przegubu, Y = drugiego, Z = obrót podstawy. 1 jednostka = 1° wyjścia przekładni; F w °/min. Aplikacja używa nazw `baseAngle`, `joint1DriveAngle`, `joint2DriveAngle`; tryb kartezjański (`radiusMm`, `heightMm`) pozostaje zablokowany do zatwierdzenia kinematyki. Parametry odczytuj z płyty (`$CD`), nie zaszywaj ich w aplikacji.

## Port i protokół

- 115200 baud, 8N1, bez flow control. Linie zakończone LF; odbiornik toleruje CRLF i fragmentację.
- Przy otwieraniu ustaw DTR i RTS nieaktywne, aby nie restartować ESP32. Restart = pozycja nieznana: odrzuć kolejki, wymagaj ponownego odniesienia.
- Start: linia powitalna ma postać `Grbl … [FluidNC v4.1.1 …]`; wykrywaj fragment `[FluidNC`. Nie traktuj otwarcia portu jako gotowości; wyślij `?` i czekaj na raport.
- Komendy liniowe (G-code, `$...`) potwierdza dokładnie jedno `ok` albo `error:N`. Wysyłaj kolejną po odpowiedzi (tryb prosty). `[MSG:...]`, `[GC:...]`, raporty `<...>` i `ALARM:N` nie są potwierdzeniem.
- **Komendy czasu rzeczywistego** to pojedyncze bajty bez LF, wykonywane natychmiast, także gdy bufor jest pełny lub ruch trwa. Nie dostają `ok`:

| Bajt | Działanie |
| --- | --- |
| `?` | Raport stanu `<Stan|MPos:x,y,z|FS:f,s|...>` |
| `0x85` | Anulowanie jog: hamowanie z zadanym przyspieszeniem i czyszczenie kolejki jog |
| `!` | Wstrzymanie (feed hold) z hamowaniem; `~` wznawia |
| `0x18` (Ctrl-X) | Reset programowy; podczas ruchu zatrzymuje kroki natychmiast → ALARM:3, pozycja niepewna |

Stany w raporcie: `Idle`, `Jog`, `Run`, `Hold:n`, `Alarm`, `Home`, `Sleep`, `Door`, `Check`. Pozycja może przyjść jako `MPos` lub `WPos` (z `WCO`); parsuj oba. Raport `?` wolno wysyłać co 50–200 ms.

## Sekwencja połączenia

1. Otwórz port bez resetu, wyślij `?`.
2. Stan `Alarm` po starcie (ALARM:14 Unhomed) jest normalny. Aplikacja pokazuje stan „pozycja nieznana” i **nie wysyła automatycznie `$X`**.
3. Użytkownik ustawia ramię w pozycji odniesienia według [uruchomienie.md](uruchomienie.md) i świadomie zatwierdza; dopiero wtedy aplikacja wysyła `$X`.
4. Opcjonalnie `$CD` — sprawdzenie profilu (`steps_per_mm`, `max_rate_mm_per_min`, okno).

Nie wysyłaj automatycznie `$MD`, `$H`, `$Bye` ani ruchu.

## Jog z pada

Wzorzec Grbl „joystick jogging”:

- Jog: `$J=G91 G21 X<dx> Y<dy> Z<dz> F<f>`. Krótkie przyrosty, np. `dt` = 50–100 ms: `d = v × dt`, `F = |v| × 60` (°/min), gdzie `|v|` to długość wektora prędkości w °/s.
- Utrzymuj mały horyzont: maks. 2–3 jog bez `ok`. Nowy przyrost na podstawie NAJNOWSZEGO stanu pada; nie kolejkuj próbek.
- Puszczenie gałki, puszczenie przycisku zezwolenia, utrata fokusu lub odłączenie pada: natychmiast `0x85`, wyczyść niewysłane przyrosty. Ramię hamuje z przyspieszeniem z konfiguracji.
- Jog poza oknem `soft_limits` jest skracany do granicy (bez alarmu). G0/G1 poza oknem kończy się alarmem — w trybie pada używaj tylko `$J=`.
- Ruch wyłącznie w stanie `Idle`/`Jog`, po świadomym uzbrojeniu i z przytrzymanym zezwoleniem.

## Stop, utrata łączności

- Zwykłe zatrzymanie pada: `0x85`.
- Pilne zatrzymanie z hamowaniem: `!`, potem `0x85` lub Ctrl-X, aby wyczyścić stan.
- Ctrl-X podczas ruchu: natychmiastowe odcięcie kroków, możliwa utrata pozycji, ALARM:3. Wymaga ponownego odniesienia przed `$X`.
- Utrata USB nie zatrzymuje już przyjętych przyrostów; dlatego horyzont jest krótki (≤ ~0,3 s ruchu).
- `$MD` zwalnia napędy i ramię może opaść. Nie używać jako STOP.
- Programowy stop nie jest sprzętowym E-stopem. Podczas testów wymagane fizyczne odcięcie zasilania napędów i podparcie.

## Kryteria odbioru frontendu

Symulator serial: odpowiedzi we fragmentach, kilka linii naraz, `ok` przeplatane raportami `<...>` i `[MSG:]`, `ALARM:N` w środku sesji, restart z linią powitalną, `error:N`, odłączenie USB/pada, utrata fokusu, puszczenie zezwolenia (`0x85` wysłany), ograniczenie horyzontu jog, brak automatycznego `$X`. Na sprzęcie: kierunki i skala, zachowanie na granicy okna, zmierzony czas i kąt hamowania po `0x85` przy maks. prędkości.

Źródła: [FluidNC wiki](https://github.com/bdring/FluidNC/wiki), [Grbl jogging](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Jogging), [Grbl interface](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Interface). Zachowanie stanów sprawdzono w źródłach FluidNC v4.1.1.
