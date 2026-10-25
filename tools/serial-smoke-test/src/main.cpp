#include <Arduino.h>

// Test komunikacji, bez digitalWrite/pinMode na nieznanych pinach plyty.
// Nie uzywamy LED_BUILTIN: na tej plycie GPIO moga sterowac urzadzeniami.
constexpr unsigned long SERIAL_BAUD = 115200;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 1000;

void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.println("TINYBEE_SERIAL_TEST ready");
}

void loop() {
  static uint32_t lastHeartbeat = 0;
  static uint32_t counter = 0;
  const uint32_t now = millis();
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = now;
    Serial.print("TINYBEE_SERIAL_TEST heartbeat=");
    Serial.print(++counter);
    Serial.print(" uptime_ms=");
    Serial.println(now);
  }
}
