#include "FspTimer.h"
#include <Arduino.h>
#include <Servo.h>

// ===== CONFIGURATION =====
#define NUM_CHANNELS 2 // A0, A2
#define HEADER_LEN 3
#define PACKET_LEN (NUM_CHANNELS * 2 + HEADER_LEN + 1) // 8 bytes
#define SAMP_RATE 1000.0                               // 1 kHz
#define SYNC_BYTE_1 0xC7
#define SYNC_BYTE_2 0x7C
#define END_BYTE 0x01
#define BAUD_RATE 230400

// ===== PIN CONFIG =====
#define LED_RED_1 13    // Top 1
#define LED_RED_2 12    // Top 2
#define LED_YELLOW_1 11 // Middle 1
#define LED_YELLOW_2 10 // Middle 2
#define LED_GREEN_1 9   // Bottom 1
#define LED_GREEN_2 8   // Bottom 2

#define SERVO_PIN 2 // Output Signal to Servo

#define SW_1 4 // Button 1
#define SW_2 7 // Button 2

// ===== GLOBALS =====
uint8_t packetBuffer[PACKET_LEN];
volatile bool timerStatus = false;
volatile bool bufferReady = false;

bool isConnected = false;
bool isAcquiring = false;

FspTimer AcqTimer; // Data Acquisition (1kHz)
Servo servo;       // Servo object for stable PWM

// ===== TIMER FUNCTIONS =====
bool timerStart() {
  timerStatus = true;
  isAcquiring = true;
  isConnected = true;
  return AcqTimer.start();
}

bool timerStop() {
  timerStatus = false;
  bufferReady = false;
  isAcquiring = false;
  return AcqTimer.stop();
}

void acqTimerCallback(timer_callback_args_t __attribute((unused)) * p_args) {
  if (!timerStatus) {
    return;
  }

  // Read 2 channels (A0, A2)
  uint16_t adc0 = analogRead(A0);
  packetBuffer[HEADER_LEN] = highByte(adc0);
  packetBuffer[HEADER_LEN + 1] = lowByte(adc0);

  uint16_t adc2 = analogRead(A2);
  packetBuffer[HEADER_LEN + 2] = highByte(adc2);
  packetBuffer[HEADER_LEN + 3] = lowByte(adc2);

  // Increment counter
  packetBuffer[2]++;
  bufferReady = true;
}

bool timerBegin(float sampling_rate) {
  uint8_t timer_type = GPT_TIMER;
  int8_t timer_channel = FspTimer::get_available_timer(timer_type);

  if (timer_channel != -1) {
    AcqTimer.begin(TIMER_MODE_PERIODIC, timer_type, timer_channel,
                   sampling_rate, 0.0f, acqTimerCallback);
    AcqTimer.setup_overflow_irq();
    AcqTimer.open();
    return true;
  } else {
    return false;
  }
}

// ===== DATA TRANSMISSION =====
void sendBinaryPacket() { Serial.write(packetBuffer, PACKET_LEN); }

// ===== COMMAND PROCESSING =====
void processCommand(String command) {
  command.trim();
  command.toUpperCase();

  // If we receive ANY command, we ensure we are marked connected
  if (!isConnected) {
    isConnected = true;
  }

  if (command.startsWith("DEG ")) {
    int angle = command.substring(4).toInt();
    if (angle >= 0 && angle <= 180) {
      servo.write(angle);
      Serial.print("ACK_DEG: ");
      Serial.println(angle);
    }
  } else if (command == "WHORU") {
    Serial.println("UNO-R4-2CH-1000HZ-SSVEP");
  } else if (command == "START") {
    timerStart();
    Serial.println("ACQUISITION_STARTED");
  } else if (command == "STOP") {
    timerStop();
    Serial.println("ACQUISITION_STOPPED");
  } else if (command == "STATUS") {
    Serial.println(timerStatus ? "RUNNING" : "STOPPED");
  } else if (command == "CONFIG") {
    Serial.println("2 CHANNELS @ 1000 Hz (SERVO ENABLED, SSVEP)");
    Serial.println("CH0 = A0, CH1 = A2");
    Serial.println("SERVO PIN = 2");
    Serial.println("PACKET_SIZE = 8 bytes");
  } else {
    Serial.println("UNKNOWN_COMMAND");
  }

  delay(5);
}

// ===== SETUP =====
void setup() {
  Serial.begin(BAUD_RATE);

  // LED Setup
  pinMode(LED_RED_1, OUTPUT);
  pinMode(LED_RED_2, OUTPUT);
  pinMode(LED_YELLOW_1, OUTPUT);
  pinMode(LED_YELLOW_2, OUTPUT);
  pinMode(LED_GREEN_1, OUTPUT);
  pinMode(LED_GREEN_2, OUTPUT);

  // Servo Setup
  pinMode(SERVO_PIN, OUTPUT);
  servo.attach(SERVO_PIN);
  servo.write(90); // Neutral

  // Switch Setup
  pinMode(SW_1, INPUT);
  pinMode(SW_2, INPUT);

  // Initialize packet buffer
  packetBuffer[0] = SYNC_BYTE_1;
  packetBuffer[1] = SYNC_BYTE_2;
  packetBuffer[2] = 0;
  packetBuffer[PACKET_LEN - 1] = END_BYTE;

  timerBegin(SAMP_RATE);
  analogReadResolution(14);

  // Initial State
  isConnected = false;
  isAcquiring = false;

  // Print banner
  Serial.println("\n=== BCI UNO R4 (STABLE SERVO PWM, 1KHZ, SSVEP) ===");
}

// ===== LED ANIMATION =====
void runSSVEPAnimation() {
  static unsigned long lastUpdate[6] = {0, 0, 0, 0, 0, 0};
  static bool ledState[6] = {false, false, false, false, false, false};

  const int ledPins[6] = {LED_RED_1, LED_RED_2, LED_YELLOW_1, LED_YELLOW_2, LED_GREEN_1, LED_GREEN_2};
  
  // Half-period in microseconds: 500000 / frequency
  // 8Hz, 9Hz, 12Hz, 14.4Hz, 16Hz, 18Hz
  const unsigned long halfPeriod[6] = {
    62500, // 500000 / 8.0
    55555, // 500000 / 9.0
    41666, // 500000 / 12.0
    34722, // 500000 / 14.4
    31250, // 500000 / 16.0
    27777  // 500000 / 18.0
  };

  unsigned long currentMicros = micros();

  for (int i = 0; i < 6; i++) {
    if (currentMicros - lastUpdate[i] >= halfPeriod[i]) {
      lastUpdate[i] = currentMicros;
      ledState[i] = !ledState[i];
      digitalWrite(ledPins[i], ledState[i] ? HIGH : LOW);
    }
  }
}

// ===== MAIN LOOP =====
void loop() {
  // 1. LED SSVEP Flickering
  runSSVEPAnimation();

  // 2. Data Sending
  if (timerStatus && bufferReady) {
    sendBinaryPacket();
    bufferReady = false;
  }

  // 3. Command Processing
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    processCommand(command);
  }

  // 4. Switch Handling (Robust Debounce)
  static bool sw1State = LOW;
  static bool sw2State = LOW;
  static bool lastReading1 = LOW;
  static bool lastReading2 = LOW;
  static unsigned long lastDebounceTime1 = 0;
  static unsigned long lastDebounceTime2 = 0;
  unsigned long debounceDelay = 50;

  bool reading1 = digitalRead(SW_1);
  if (reading1 != lastReading1)
    lastDebounceTime1 = millis();
  if ((millis() - lastDebounceTime1) > debounceDelay) {
    if (reading1 != sw1State) {
      sw1State = reading1;
      if (sw1State == HIGH)
        Serial.println("MSG:SWITCH_1_PRESSED");
    }
  }
  lastReading1 = reading1;

  bool reading2 = digitalRead(SW_2);
  if (reading2 != lastReading2)
    lastDebounceTime2 = millis();
  if ((millis() - lastDebounceTime2) > debounceDelay) {
    if (reading2 != sw2State) {
      sw2State = reading2;
      if (sw2State == HIGH)
        Serial.println("MSG:SWITCH_2_PRESSED");
    }
  }
  lastReading2 = reading2;
}
