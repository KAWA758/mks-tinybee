# Kontrakt aplikacja Windows — firmware, wersja 0.1

Status: kontrakt do implementacji i testów; brak testu na fizycznej płycie. Autor aplikacji może już budować połączenie, parser i symulator. Sterowanie sprzętem wymaga ukończonej kalibracji opisanej w `uruchomienie.md`.

## Podział odpowiedzialności

Firmware: impulsy STEP/DIR, skoordynowana realizacja zadanych ruchów osi, ograniczenia prędkości/przyspieszeń, granice ustawione w firmware. Aplikacja Windows: pad, mapowanie wejść, profil sprzętu, pozycja odniesienia, kontrola zakresów/kolizji, planowanie krótkich ruchów i serial. Nie trzeba implementować aplikacji w tym repo; można utrzymywać oddzielne repo i uzgadniać wersję tego kontraktu.

Na start aplikacja działa w trybie przegubowym: X = napęd pierwszego przegubu, Y = drugiego, Z = obrót podstawy. W profilu skalibrowanym 1 jednostka G-code = 1° wyjścia przekładni. Odczytuj M503 i sprawdzaj profil przed odblokowaniem ruchu. Obecne domyślne M92 `{80,80,400}` nie spełnia kontraktu stopni — sam G21 tego nie naprawia.

Tryb kartezjański pozostaje niedostępny do zatwierdzenia kinematyki. Aplikacja ma używać odrębnych nazw, np. `baseAngle`, `joint1DriveAngle`, `joint2DriveAngle` oraz `radiusMm`, `heightMm`. Nie traktować G-code Z jako wysokości. Mechaniczne poziomowanie głowicy nie oznacza kompensacji X:Y równej 1:1. Długości 120/120 mm są potwierdzone, lecz zera i relacja napędów do kątów członów wymagają pomiaru. Jedna interpolowana linia ruchu przegubów nie gwarantuje prostej trajektorii głowicy.

## Port i protokół

- Port wybierany przez użytkownika, np. COM7. Tylko jeden proces otwiera port: aplikacja albo PlatformIO monitor/upload.
- 250000 baud, 8N1, bez sprzętowego flow control; komendy ASCII zakończone LF. Odbiornik toleruje CRLF i fragmentację danych w dowolnym miejscu linii.
- Otwieranie portu/DTR/RTS może zresetować ESP32. Nie traktować otwarcia portu jako gotowości. Po restarcie odrzucić poprzednie kolejki i uznać pozycję za nieznaną.
- Jeden zapisujący worker, jedna ścieżka parsowania odpowiedzi. Tryb podstawowy bez N/checksum; jeśli pojawi się `Resend:`, przerwać sesję i ponownie zsynchronizować, zamiast wymyślać numery.
- Komendy wysyłane kolejno po `ok`. `ok` może zawierać dodatkowe pola. `echo:`, `busy:`, `wait`, raporty pozycji i bootlog nie są potwierdzeniem komendy. `Error:` zatrzymuje nadawanie i wymaga obsługi błędu.
- Timeout konfigurowalny; dla M400 uwzględnić czas ruchu. Nie ponawiać automatycznie G0/G1 po timeout: ruch mógł zostać wykonany mimo utraconej odpowiedzi.

Sekwencja połączenia bez ruchu: synchronizacja po starcie, `M115`, `M503`, `M114`, każda komenda z potwierdzeniem. Nie wysyłać automatycznie M17, G28, G92, M18 ani ruchu. Użytkownik osobno zatwierdza profil kalibracji oraz fizyczny punkt odniesienia. EEPROM jest wyłączone, więc profil runtime znika po resecie.

## Potwierdzenie i zakończenie ruchu

`ok` po G1 oznacza przyjęcie/przetworzenie polecenia, a nie fizyczny koniec ruchu. `M400` z późniejszym `ok` oznacza opróżniony planner. Dopiero potem standardowe M114 nadaje się do uzgodnienia końcowej pozycji wyliczonej. M114 nadal nie wykrywa zgubionych kroków.

## Pad i ograniczenie kolejki

Wymagane stany: rozłączony, połączony/pozycja nieznana, gotowy, ruch, błąd/utrata odniesienia. Ruch wyłącznie po świadomym uzbrojeniu, z przytrzymanym przyciskiem zezwolenia. Gałki mają martwą strefę, ograniczenie prędkości i łagodną zmianę wartości. Rozłączony pad, utrata fokusu lub puszczenie zezwolenia zerują żądane prędkości i usuwają niewysłane ruchy aplikacji. Nie wykonują automatycznie M18, ponieważ ramię może opaść.

Pierwsza implementacja: pojedynczy segment trwający około 50–100 ms, potem M400 i dopiero po jego `ok` następny segment z NAJNOWSZEGO stanu pada. Nie magazynować próbek pada. To celowo prosty tryb startowy, może dawać przerwy między segmentami. Czas trzeba zweryfikować na sprzęcie z uwzględnieniem przyspieszeń, transmisji i opóźnień Windows; nie jest gwarantowanym czasem zatrzymania.

Nie wystarczy jeden G1 oczekujący na `ok`: planner może nadal gromadzić ruchy. Docelowe płynne sterowanie wymaga mierzonego, ograniczonego horyzontu ruchu; nie wysyłać G1 przy każdym zdarzeniu pada bez kontroli kolejki.

Do trybu ciągłego preferować krótkie cele absolutne G90 z lokalnie śledzonym celem, ograniczeniami i przeliczeniem prędkości na F (długość wektora przyrostu / czas × 60). Z góry ustalić jednostki profilu i ramę odniesienia. Nie mieszać G90/G91 między workerami. Nie zaokrąglać każdego małego przyrostu do całych kroków: akumulować ułamkowy cel.

## Stop, utrata łączności i ograniczenia

- Normalne zatrzymanie pada: przestać generować segmenty; już przyjęty krótki segment może się dokończyć.
- M410: szybkie zatrzymanie po obsłużeniu komendy. Usunąć niewysłaną kolejkę i uznać odniesienie za wymagające weryfikacji.
- M112: pełne wyłączenie; może zwolnić napędy i spowodować opadnięcie ramienia. Wymaga restartu i ponownego odniesienia. Nie używać jako zwykłego STOP od puszczenia gałki.
- Ten HAL ESP32 odrzuca EMERGENCY_PARSER podczas kompilacji (`Marlin/src/HAL/ESP32/inc/SanityCheck.h`). M112/M410 idą zwykłą ścieżką odbioru i nie mają gwarancji natychmiastowej obsługi. Szczególnie M400 może blokować ich wykonanie do końca ruchu. Priorytet wysyłki w aplikacji nie zmienia tej właściwości firmware.
- Utrata USB nie zatrzymuje sama już przyjętej trajektorii. Obecny firmware nie ma wdrożonego watchdogu sterowania padem. Nie polegać na timeout 120 s jako zabezpieczeniu ruchu.
- Fizyczny sposób odcięcia napędu i podparcie mechanizmu są konieczne podczas testów. Nie deklarować programowego STOP jako sprzętowego E-stopu.
- Po M18/M84, resecie, ręcznym ruchu albo zgubieniu kroków zablokować ruch do ponownego ustalenia pozycji. Domyślne granice firmware nie opisują bezpiecznej przestrzeni tego ramienia.

## Kryteria odbioru frontendu

Testy na symulatorze serial: odpowiedzi w fragmentach, kilka linii naraz, `ok` z polami, bootlog w środku sesji, timeout po przyjęciu G1, `Error:`, odłączenie USB/pada, utrata fokusu, puszczenie zezwolenia, brak automatycznych powtórek ruchu i brak narastania kolejki. Na sprzęcie: zgodność kierunków i skali, ponowne odniesienie po resecie, obserwowany czas zatrzymania przy maksymalnej dopuszczonej prędkości. Ruch kartezjański pozostaje zablokowany do oddzielnych testów geometrii.

Źródła: [M400](https://marlinfw.org/docs/gcode/M400.html), [M410](https://marlinfw.org/docs/gcode/M410.html), [M112](https://marlinfw.org/docs/gcode/M112.html). Zachowanie konkretnego HAL i dostępność funkcji sprawdzono również w źródłach tego repo.
