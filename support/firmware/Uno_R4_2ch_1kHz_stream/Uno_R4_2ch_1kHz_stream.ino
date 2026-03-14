#include "FspTimer.h"
#include <Arduino.h>
#include <Servo.h>

// ===== CONFIGURATION =====
#define NUM_CHANNELS 2   // A0, A2
#define SAMP_RATE 1000.0 // 1000 Hz
#define BAUD_RATE 230400

// ===== PIN CONFIG =====
#define LED_RED_1 13
#define LED_RED_2 12
#define LED_YELLOW_1 11
#define LED_YELLOW_2 10
#define LED_GREEN_1 9
#define LED_GREEN_2 8
#define SERVO_PIN 2
#define SW_1 4
#define SW_2 7

// ===== GLOBALS =====
#define BUFFER_SIZE 256
volatile uint16_t sampleBufferA[BUFFER_SIZE * NUM_CHANNELS];
volatile uint16_t sampleBufferB[BUFFER_SIZE * NUM_CHANNELS];
volatile uint16_t *currentBuffer = sampleBufferA;
volatile uint16_t *sendBuffer = nullptr;
volatile uint16_t indexCount = 0;
volatile bool send_flag = false;
volatile uint32_t packet_timestamp = 0;

volatile bool timerStatus = false;
bool isConnected = false;
bool isAcquiring = false;

FspTimer AcqTimer;
Servo servo;

void updateLEDs() {
  if (!isConnected) {
    digitalWrite(LED_RED_1, HIGH);
    digitalWrite(LED_RED_2, HIGH);
    digitalWrite(LED_YELLOW_1, LOW);
    digitalWrite(LED_YELLOW_2, LOW);
    digitalWrite(LED_GREEN_1, LOW);
    digitalWrite(LED_GREEN_2, LOW);
  } else if (isConnected && !isAcquiring) {
    digitalWrite(LED_RED_1, LOW);
    digitalWrite(LED_RED_2, LOW);
    digitalWrite(LED_YELLOW_1, HIGH);
    digitalWrite(LED_YELLOW_2, HIGH);
    digitalWrite(LED_GREEN_1, LOW);
    digitalWrite(LED_GREEN_2, LOW);
  }
}

bool timerStart() {
  timerStatus = true;
  isAcquiring = true;
  isConnected = true;
  updateLEDs();
  return AcqTimer.start();
}

bool timerStop() {
  timerStatus = false;
  send_flag = false;
  isAcquiring = false;
  updateLEDs();
  return AcqTimer.stop();
}

void acqTimerCallback(timer_callback_args_t __attribute((unused)) * p_args) {
  if (!timerStatus)
    return;

  currentBuffer[indexCount++] = analogRead(A0);
  currentBuffer[indexCount++] = analogRead(A2);

  if (indexCount >= (BUFFER_SIZE * NUM_CHANNELS)) {
    indexCount = 0;
    if (currentBuffer == sampleBufferA) {
      sendBuffer = sampleBufferA;
      currentBuffer = sampleBufferB;
    } else {
      sendBuffer = sampleBufferB;
      currentBuffer = sampleBufferA;
    }
    packet_timestamp = millis();
    send_flag = true;
  }
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
  }
  return false;
}

void sendBinaryPacket() {
  const uint8_t SYNC[2] = {0xC7, 0x7C};
  const uint8_t END = 0x01;

  Serial.write(SYNC, 2);
  Serial.write((uint8_t *)&packet_timestamp, 4);
  Serial.write((uint8_t *)sendBuffer, BUFFER_SIZE * NUM_CHANNELS * 2);
  Serial.write(&END, 1);
}

void processCommand(String command) {
  command.trim();
  command.toUpperCase();

  if (!isConnected) {
    isConnected = true;
    updateLEDs();
  }

  digitalWrite(LED_YELLOW_2, HIGH);

  if (command.startsWith("DEG ")) {
    int angle = command.substring(4).toInt();
    if (angle >= 0 && angle <= 180) {
      servo.write(angle);
      Serial.print("ACK_DEG: ");
      Serial.println(angle);
    }
  } else if (command == "WHORU") {
    Serial.println("UNO-R4-2CH-1KHZ");
  } else if (command == "START") {
    timerStart();
    Serial.println("ACQUISITION_STARTED");
  } else if (command == "STOP") {
    timerStop();
    Serial.println("ACQUISITION_STOPPED");
  } else if (command == "STATUS") {
    Serial.println(timerStatus ? "RUNNING" : "STOPPED");
  } else if (command == "CONFIG") {
    Serial.println("2 CHANNELS @ 1000 Hz (SERVO ENABLED)");
    Serial.println("CH0 = A0, CH1 = A2");
    Serial.println("BUFFER = 256 per channel");
  } else {
    Serial.println("UNKNOWN_COMMAND");
  }

  delay(5);
  digitalWrite(LED_YELLOW_2, LOW);
}

void setup() {
  Serial.begin(BAUD_RATE);

  pinMode(LED_RED_1, OUTPUT);
  pinMode(LED_RED_2, OUTPUT);
  pinMode(LED_YELLOW_1, OUTPUT);
  pinMode(LED_YELLOW_2, OUTPUT);
  pinMode(LED_GREEN_1, OUTPUT);
  pinMode(LED_GREEN_2, OUTPUT);

  pinMode(SERVO_PIN, OUTPUT);
  servo.attach(SERVO_PIN);
  servo.write(90);

  pinMode(SW_1, INPUT);
  pinMode(SW_2, INPUT);

  timerBegin(SAMP_RATE);
  analogReadResolution(14);

  isConnected = false;
  isAcquiring = false;
  updateLEDs();

  Serial.println("\n=== BCI UNO R4 1kHz ===");
}

void runChaserAnimation() {
  static unsigned long lastUpdate = 0;
  static int currentLedIdx = 0;
  const int ledPins[] = {LED_RED_1,    LED_RED_2,   LED_YELLOW_1,
                         LED_YELLOW_2, LED_GREEN_1, LED_GREEN_2};

  if (millis() - lastUpdate > 100) {
    lastUpdate = millis();
    for (int i = 0; i < 6; i++)
      digitalWrite(ledPins[i], LOW);
    digitalWrite(ledPins[currentLedIdx], HIGH);
    currentLedIdx = (currentLedIdx + 1) % 6;
  }
}

void loop() {
  if (isConnected && isAcquiring) {
    runChaserAnimation();
  }

  if (timerStatus && send_flag) {
    noInterrupts();
    send_flag = false;
    interrupts();
    sendBinaryPacket();
  }

  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    processCommand(command);
  }

  // Switch Debounce
  static bool sw1State = LOW;
  static bool sw2State = LOW;
  static bool lastReading1 = LOW;
  static bool lastReading2 = LOW;
  static unsigned long lastDebounceTime1 = 0;
  static unsigned long lastDebounceTime2 = 0;

  bool reading1 = digitalRead(SW_1);
  if (reading1 != lastReading1)
    lastDebounceTime1 = millis();
  if ((millis() - lastDebounceTime1) > 50) {
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
  if ((millis() - lastDebounceTime2) > 50) {
    if (reading2 != sw2State) {
      sw2State = reading2;
      if (sw2State == HIGH)
        Serial.println("MSG:SWITCH_2_PRESSED");
    }
  }
  lastReading2 = reading2;
}
