#pragma once

// JEDYNE miejsce edycji parametrow ramienia. Po zmianie: build + upload.
// X = naped przegubu 1, Y = naped przegubu 2, Z = obrot podstawy.
// 1 jednostka G-code = 1 stopien wyjscia przekladni (nie mm glowicy).
// Profil rozruchowy: mikrokrok i kierunki wymagaja testu na sprzecie.

// Komunikacja z aplikacja Windows; monitor musi miec ten sam baudrate.
#define ROBOT_SERIAL_BAUD 250000

// Typy sterownikow. STANDALONE: prad i mikrokrok ustawia sprzet, nie UART.
#define ROBOT_X_DRIVER TMC2209_STANDALONE
#define ROBOT_Y_DRIVER TMC2209_STANDALONE
#define ROBOT_Z_DRIVER TMC2209_STANDALONE

// Pelne kroki silnika na obrot: 200 dla 1.8 stopnia; 400 dla 0.9 stopnia.
#define ROBOT_X_MOTOR_STEPS 200
#define ROBOT_Y_MOTOR_STEPS 200
#define ROBOT_Z_MOTOR_STEPS 200

// Impulsy STEP na pelny krok. Zalozenie: TMC2209 MS1=MS2=0 -> 8.
// Zmiana tych liczb NIE przestawia zworek. Nie wpisuj interpolacji 256.
#define ROBOT_X_MICROSTEPS 8
#define ROBOT_Y_MICROSTEPS 8
#define ROBOT_Z_MICROSTEPS 8

// Liczba zebow: male kolo na silniku i duze na wyjsciu napedu.
#define ROBOT_X_MOTOR_TEETH 9
#define ROBOT_Y_MOTOR_TEETH 9
#define ROBOT_Z_MOTOR_TEETH 9
#define ROBOT_X_OUTPUT_TEETH 32
#define ROBOT_Y_OUTPUT_TEETH 32
#define ROBOT_Z_OUTPUT_TEETH 32

// Korekta po pomiarze: nowa = stara * kat_zadany / kat_zmierzony.
// Normalnie 1.0. Zmieniaj oddzielnie dla osi; nie koryguj tu kierunku.
#define ROBOT_X_STEP_CORRECTION 1.0f
#define ROBOT_Y_STEP_CORRECTION 1.0f
#define ROBOT_Z_STEP_CORRECTION 1.0f

// Maksymalne predkosci poszczegolnych napedow [stopnie/s]. M203.
// F w G1 jest w stopniach/min, np. F30 = 0.5 stopnia/s.
#define ROBOT_X_MAX_SPEED_DPS 2.0f
#define ROBOT_Y_MAX_SPEED_DPS 2.0f
#define ROBOT_Z_MAX_SPEED_DPS 2.0f

// Maksymalne przyspieszenia osi [stopnie/s^2]. M201. Wpisuj liczby calkowite.
#define ROBOT_X_MAX_ACCEL_DPS2 10
#define ROBOT_Y_MAX_ACCEL_DPS2 10
#define ROBOT_Z_MAX_ACCEL_DPS2 10

// Przyspieszenie zadane dla calego ruchu, ograniczane limitami osi. M204.
// Przy EXTRUDERS=0 ruch G0/G1 jest ruchem travel: uzywa wartosci TRAVEL.
#define ROBOT_MOVE_ACCEL_DPS2 10.0f
#define ROBOT_TRAVEL_ACCEL_DPS2 10.0f

// Junction deviation: tolerancja lanczenia odcinkow w umownych stopniach.
// Mniejsza wartosc = wolniejsze przejscia przez zakrety. M205 J.
#define ROBOT_JUNCTION_DEVIATION_DEG 0.005f

// Minimalna predkosc [stopnie/s]; 0 nie narzuca dodatkowego minimum. M205 S/T.
#define ROBOT_MIN_SPEED_DPS 0.0f
// Prog spowalniania przy oproznianiu bufora [mikrosekundy]. M205 B.
// Nie jest okresem probkowania pada ani gwarancja czasu zatrzymania.
#define ROBOT_MIN_SEGMENT_TIME_US 20000

// Odwrocenie kierunku napedu: zamien false <-> true po malym tescie.
#define ROBOT_X_INVERT_DIR false
#define ROBOT_Y_INVERT_DIR true
#define ROBOT_Z_INVERT_DIR false

// TYMCZASOWE okno rozruchowe [stopnie] wokol recznie ustalonego zera.
// To NIE sa zmierzone zakresy mechaniki ani zabezpieczenie przed kolizja X/Y.
// Przed G92 X0 Y0 Z0 ustaw fizycznie pozycje z luzem na maly ruch.
#define ROBOT_X_MIN_DEG -5
#define ROBOT_X_MAX_DEG 5
#define ROBOT_Y_MIN_DEG -5
#define ROBOT_Y_MAX_DEG 5
#define ROBOT_Z_MIN_DEG -5
#define ROBOT_Z_MAX_DEG 5

// Czas bezczynnosci przed zwolnieniem silnikow [s]. M84 S.
// 0 = trzymaj bez limitu czasu, aby ramie nie opadalo po 120 s.
// Wymaga prawidlowego pradu/chlodzenia; M18/M84 bez S nadal zwalnia silniki.
#define ROBOT_IDLE_TIMEOUT_SEC 0

// Homing pozostaje NIEURUCHOMIONY na sprzecie bez krancowek. Nie uzywaj G28.
// Predkosc ewentualnego przyszlego homingu [stopnie/min].
#define ROBOT_HOME_SPEED_DPM 30
#define ROBOT_X_HOME_DIR -1
#define ROBOT_Y_HOME_DIR -1
#define ROBOT_Z_HOME_DIR -1
#define ROBOT_HOME_BUMP_DEG 0
#define ROBOT_HOME_BUMP_DIVISOR 2

// Ponizej adapter i wyliczenia. Nie duplikuj tych wartosci w Configuration.h.
#define ROBOT_STEPS_PER_DEG(S, M, OUT, IN, C) ((S) * (M) * 1.0f * (OUT) / (IN) / 360.0f * (C))
#define ROBOT_X_STEPS_PER_DEG ROBOT_STEPS_PER_DEG(ROBOT_X_MOTOR_STEPS, ROBOT_X_MICROSTEPS, ROBOT_X_OUTPUT_TEETH, ROBOT_X_MOTOR_TEETH, ROBOT_X_STEP_CORRECTION)
#define ROBOT_Y_STEPS_PER_DEG ROBOT_STEPS_PER_DEG(ROBOT_Y_MOTOR_STEPS, ROBOT_Y_MICROSTEPS, ROBOT_Y_OUTPUT_TEETH, ROBOT_Y_MOTOR_TEETH, ROBOT_Y_STEP_CORRECTION)
#define ROBOT_Z_STEPS_PER_DEG ROBOT_STEPS_PER_DEG(ROBOT_Z_MOTOR_STEPS, ROBOT_Z_MICROSTEPS, ROBOT_Z_OUTPUT_TEETH, ROBOT_Z_MOTOR_TEETH, ROBOT_Z_STEP_CORRECTION)

#if ROBOT_X_MOTOR_TEETH <= 0 || ROBOT_Y_MOTOR_TEETH <= 0 || ROBOT_Z_MOTOR_TEETH <= 0
  #error "RobotSettings: motor gear tooth counts must be positive."
#endif
#if ROBOT_X_OUTPUT_TEETH <= 0 || ROBOT_Y_OUTPUT_TEETH <= 0 || ROBOT_Z_OUTPUT_TEETH <= 0
  #error "RobotSettings: output gear tooth counts must be positive."
#endif
#if ROBOT_X_MOTOR_STEPS <= 0 || ROBOT_Y_MOTOR_STEPS <= 0 || ROBOT_Z_MOTOR_STEPS <= 0 || ROBOT_X_MICROSTEPS <= 0 || ROBOT_Y_MICROSTEPS <= 0 || ROBOT_Z_MICROSTEPS <= 0
  #error "RobotSettings: step and microstep counts must be positive."
#endif
