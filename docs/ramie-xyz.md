# FluidNC — MKS TinyBee — ramię XYZ

Konfiguracja: [fluidnc/config.yaml](../fluidnc/config.yaml), kinematyka `Cartesian` użyta jako sterowanie niezależnymi przegubami, trzy osie XYZ, TMC2209 STANDALONE przez rejestr I2S, bez wrzeciona, grzałek i krańcówek.

## Układ mechaniczny

- Z: obrót podstawy.
- X: pierwszy przegub od podstawy.
- Y: drugi przegub, ruch góra–dół.

Głowica jest utrzymywana w poziomie przez mechanikę ramienia.
Jednoczesne sterowanie pierwszym i drugim przegubem pozwala podnosić
głowicę bez zmiany jej odległości od osi podstawy.

X/Y/Z w poleceniach firmware oznaczają osie napędów.
Z nie oznacza wysokości głowicy. Ruch pionowy głowicy wymaga wyznaczenia
trajektorii obu przegubów X i Y na podstawie geometrii mechanizmu.
Stała orientacja głowicy nie określa sama w sobie proporcji ruchu X do Y;
nie przyjęto zależności 1:1 ani stałego kierunku kompensacji.

Do wyznaczenia kinematyki potrzebne są odległości między osiami przegubów,
położenie punktu głowicy, geometria mechanizmu poziomującego oraz definicje
pozycji zerowych i dodatnich kierunków obrotu X/Y/Z. FluidNC pozwala dodać
własną klasę kinematyki w C++, ale wymaga to kompilacji firmware ze źródeł;
obecnie projekt używa gotowego wydania i trybu przegubowego.

## Kalibracja

Koło silnika: 9 zębów. Koło wyjścia: 32 zęby.
Brak zworek; dla TMC2209 MS1=MS2=0 oznacza 1/8 kroku.
Potwierdzić konfigurację konkretnego modułu sterownika.

Silnik 17HE15-1504S: 1,8°, czyli 200 kroków/obrót, prąd 1,50 A. Przy mikrokroku 1/8:
impulsy na obrót wyjścia = 200 × 8 × 32/9 = 5688,8889.
impulsy na stopień wyjścia = 5688,8889 / 360 = 15,802469 (`steps_per_mm`).

F jest podawane w stopniach na minutę. FluidNC nadal opisuje jednostki jako mm.
Opis ustawień: [parametry.md](parametry.md), testy: [uruchomienie.md](uruchomienie.md).

## Brak krańcówek

`$H` nie bazuje osi: nie ma fizycznych krańcówek. Pozycja maszynowa wynosi 0
w chwili startu ESP32; procedura ustalania odniesienia (restart w znanej pozycji,
potem `$X`) jest opisana w [uruchomienie.md](uruchomienie.md).
Okno `soft_limits` ±5° jest tymczasowe i liczone względem tej pozycji, a nie zmierzonymi granicami ramienia.
Po zaniku zasilania, restarcie, zgubieniu kroków lub ręcznym przestawieniu osi
ponownie ustalić pozycję odniesienia.
