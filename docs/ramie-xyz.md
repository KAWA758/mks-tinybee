# Marlin — MKS TinyBee — testy ramienia XYZ

VS Code: PlatformIO IDE, Auto Build Marlin, C/C++.
Kompilacja: Auto Build Marlin → Build, środowisko mks_tinybee.

Skonfigurowano BOARD_MKS_TINYBEE, trzy osie XYZ, TMC2209_STANDALONE,
EXTRUDERS=0 oraz brak czujników temperatury hotendu i stołu.
Kompilacja PlatformIO zakończona powodzeniem.

## Układ mechaniczny

- Z: obrót podstawy.
- X: pierwszy przegub od podstawy.
- Y: drugi przegub, ruch góra–dół.

Głowica jest utrzymywana w poziomie przez mechanikę ramienia.
Jednoczesne sterowanie pierwszym i drugim przegubem pozwala podnosić
głowicę bez zmiany jej odległości od osi podstawy.

X/Y/Z w poleceniach obecnego firmware oznaczają osie napędów.
Z nie oznacza wysokości głowicy. Ruch pionowy głowicy wymaga wyznaczenia
trajektorii obu przegubów X i Y na podstawie geometrii mechanizmu.
Stała orientacja głowicy nie określa sama w sobie proporcji ruchu X do Y;
nie przyjęto zależności 1:1 ani stałego kierunku kompensacji.

Do wyznaczenia kinematyki potrzebne są odległości między osiami przegubów,
położenie punktu głowicy, geometria mechanizmu poziomującego oraz definicje
pozycji zerowych i dodatnich kierunków obrotu X/Y/Z.

## Kalibracja oczekująca na dane

Koło silnika: 9 zębów. Koło wyjścia: 32 zęby.
Brak zworek; dla TMC2209 MS1=MS2=0 oznacza 1/8 kroku.
Potwierdzić konfigurację konkretnego modułu sterownika.

Jeżeli silnik ma 200 kroków/obrót i mikrokrok 1/8:
impulsy na obrót wyjścia = 200 × 8 × 32/9 = 5688,8889.
impulsy na stopień wyjścia = 5688,8889 / 360 = 15,802469.

Wartości kroków, prędkości, przyspieszeń i zakresy osi w Configuration.h
pozostają wartościami bazowymi Marlina, a nie kalibracją ramienia.
Nie wprowadzono powyższego przelicznika bez potwierdzenia silników.
Przy przyjęciu 1 jednostka = 1 stopień, prędkość F będzie podawana
w stopniach na minutę. Marlin nadal opisuje jednostki jako mm.
To sterowanie osiami przegubów; nie zaimplementowano kinematyki ramienia.

## Brak krańcówek

Nie wykonywać G28: nie ma fizycznych krańcówek do bazowania.
Ustawić ramię w znanej pozycji i przypisać współrzędne przez G92.
Limity programowe wymagają ustalenia rzeczywistych zakresów X/Y/Z.
Obecne limity są domyślnymi granicami drukarki, nie ramienia.
Po zaniku zasilania, zgubieniu kroków lub ręcznym przestawieniu osi
ponownie ustalić pozycję odniesienia.
