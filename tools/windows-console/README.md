# TinyBee — konsola testowa Windows

Lekki interfejs WinForms (.NET Framework 4.x, bez NuGet). Uruchom `build.ps1`
w PowerShell, następnie `TinyBeeConsole.exe`. Program szuka `Marlin/RobotSettings.h`
w katalogach nadrzędnych; pozostaw EXE w tym folderze repozytorium.

## Pierwszy test

1. Zamknij monitor PlatformIO (Ctrl+C), żeby zwolnić COM.
2. Wybierz port TinyBee i 250000 baud, kliknij **Połącz**. Program odczeka
   na ustanie komunikatów startowych i odczyta M115, M503, M114. Nie wykonuje ruchu.
3. Sprawdź M503 w terminalu. Tabela runtime pokazuje początkowo **domyślne wartości
   z pliku**, nie odczytane wartości płyty.
4. Sprawdź przestrzeń ruchu, potwierdź pozycję startową. Ustaw kąt i prędkość;
   kliknij X/Y/Z + lub −. X = pierwszy przegub, Y = drugi, Z = podstawa.
   Przykładowo 2° przy 0.5°/s to jeden ciągły odcinek trwający około 4 s
   plus rozpędzanie/hamowanie. Marlin może ograniczyć prędkość przez M203.
5. Program czeka na M400, przywraca G90 i odczytuje M114. Nie gromadzi kliknięć
   ani nie powtarza ruchów po timeout. To testy pojedynczych ruchów, bez pada
   i bez strumieniowania ruchu ciągłego.

Kąt jest umowny do fizycznego potwierdzenia skali. Lokalne okno ±5° liczy sumę
ruchów od ręcznie potwierdzonego startu. Nie zmienia G92, nie mierzy pozycji ani
nie wykrywa kolizji X/Y. Ponowne zaznaczenie potwierdzenia ustala nowy start.
Nie polegaj na soft endstopach Marlin: dla osi bez homingu mogą nie ograniczać ruchu.

## Parametry

- **Runtime**: zaznacz wiersz, edytuj wartość i wyślij. M92 = impulsy/stopień,
  M203 = maks. °/s, M201 = maks. °/s², M204 T = przyspieszenie ramienia,
  M205 = łączenie segmentów/minima, M84 S = timeout podtrzymania silników.
  Każdy wiersz ma opis. Zmiana unieważnia lokalne odniesienie, po wysłaniu program
  żąda M503. Ustawienia znikają po resecie (EEPROM wyłączone).
- **Firmware**: wszystkie edytowalne stałe ROBOT_* przed sekcją adaptera
  w RobotSettings.h, z komentarzami. Zapisz plik, przejrzyj `git diff`, zbuduj
  i wgraj Marlin. Walidacja edytora jest składniowa; kompilator sprawdza konfigurację.
  Formuły pochodne pozostają niezmienione. Zapis pliku nie wysyła nic do płyty.
- Typ sterownika, kierunek, zakresy, homing, baud i parametry przekładni wymagają
  kompilacji. Mikrokroki i prąd TMC2209_STANDALONE wymagają ustawienia sprzętowego;
  wpisanie liczby nie przełącza zworek ani nie zmienia prądu.
- Marlin akceptuje M205 J tylko 0.01–0.3, mimo domyślnego 0.005 w tym projekcie.
  Edytor runtime blokuje wysłanie wartości spoza zakresu; pozostaw domyślną albo
  zmień ją przez firmware.

Terminal wysyła jedną linię ASCII. Polecenia inne niż M115/M114/M119/M503 wymagają
odblokowania i potwierdzenia, omijają lokalne ograniczenia i unieważniają odniesienie.
Nie używaj G28 bez uruchomionych krańcówek. M18/M84 bez S mogą spowodować opadnięcie.

**STOP M410** wysyła komendę i zamyka sesję, aby nie pomylić starych potwierdzeń.
Nie potwierdza fizycznego zatrzymania: HAL ESP32 nie ma EMERGENCY_PARSER,
więc M410 może czekać za M400. Rozłączenie USB też nie anuluje przyjętego ruchu.
Przy testach miej fizyczną możliwość przerwania napędu i zabezpiecz ramię przed opadnięciem.

## Sprawdzenie aplikacji

`TinyBeeConsole.exe --self-test` zapisuje wynik w ignorowanym `self-test.log`.
Testuje fragmentację odpowiedzi, `ok` z polami, błędy, restart, resend i timeout
bez ponawiania komend. EXE jest ignorowany przez Git; kod i skrypt budowania są wersjonowane.
Testy protokołu i kompilacja nie zastępują testu serial na sprzęcie.
