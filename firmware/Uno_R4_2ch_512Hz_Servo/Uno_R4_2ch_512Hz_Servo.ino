#include "FspTimer.h"
#include <Arduino.h>
#include <Servo.h>

// ===== CONFIGURATION =====
#define NUM_CHANNELS 2
#define HEADER_LEN 3
#define PACKET_LEN (NUM_CHANNELS * 2 + HEADER_LEN + 1) // 8 bytes
#define SAMP_RATE 512.0
#define SYNC_BYTE_1 0xC7
#define SYNC_BYTE_2 0x7C
#define END_BYTE 0x01
#define BAUD_RATE 230400

// ===== PIN CONFIG =====
#define LED_RED_1  13
#define LED_RED_2  12
#define LED_YELLOW_1  11  
#define LED_YELLOW_2  10
#define LED_GREEN_1  9
#define LED_GREEN_2  8

#define SERVO_PIN 2   // Output Signal to Servo

#define SW_1  4
#define SW_2  7

// ===== GLOBALS =====
uint8_t packetBuffer[PACKET_LEN];  
volatile bool timerStatus = false;
volatile bool bufferReady = false;

FspTimer AcqTimer;   // Data Acquisition (512Hz)
Servo servo;         // Servo object for stable PWM

// ===== ACQUISITION INTERRUPT (512Hz) =====
void acqTimerCallback(timer_callback_args_t __attribute((unused)) * p_args) {
  if (!timerStatus) return;

  uint16_t adc0 = analogRead(A0);
  packetBuffer[3] = highByte(adc0); packetBuffer[4] = lowByte(adc0);
  uint16_t adc2 = analogRead(A2);
  packetBuffer[5] = highByte(adc2); packetBuffer[6] = lowByte(adc2);

  packetBuffer[2]++; // Sync Counter
  bufferReady = true;
}

// ===== HELPERS =====
void updateLEDs(bool isConnected, bool isAcquiring) {
  if (!isConnected) {
    digitalWrite(LED_RED_1, HIGH); digitalWrite(LED_RED_2, HIGH);
    digitalWrite(LED_YELLOW_1, LOW); digitalWrite(LED_GREEN_1, LOW);
  } else if (!isAcquiring) {
    digitalWrite(LED_RED_1, LOW); digitalWrite(LED_RED_2, LOW);
    digitalWrite(LED_YELLOW_1, HIGH); digitalWrite(LED_GREEN_1, LOW);
  } else {
    digitalWrite(LED_RED_1, LOW); digitalWrite(LED_RED_2, LOW);
    digitalWrite(LED_YELLOW_1, LOW); digitalWrite(LED_GREEN_1, HIGH);
  }
}

// ===== SETUP =====
void setup() {
  Serial.begin(BAUD_RATE);
  
  pinMode(LED_RED_1, OUTPUT); pinMode(LED_RED_2, OUTPUT);
  pinMode(LED_YELLOW_1, OUTPUT); pinMode(LED_YELLOW_2, OUTPUT);
  pinMode(LED_GREEN_1, OUTPUT); pinMode(LED_GREEN_2, OUTPUT);
  pinMode(SERVO_PIN, OUTPUT);
  pinMode(SW_1, INPUT); pinMode(SW_2, INPUT);

  packetBuffer[0] = SYNC_BYTE_1;
  packetBuffer[1] = SYNC_BYTE_2;
  packetBuffer[PACKET_LEN-1] = END_BYTE;

  // 1. Setup Data Acquisition Timer (512Hz)
  uint8_t type = GPT_TIMER;
  int ch_acq = FspTimer::get_available_timer(type);
  AcqTimer.begin(TIMER_MODE_PERIODIC, type, ch_acq, SAMP_RATE, 0.0f, acqTimerCallback);
  AcqTimer.setup_overflow_irq();
  AcqTimer.open();

  // 2. Setup Servo
  servo.attach(SERVO_PIN);
  servo.write(90); // Start at neutral position

  analogReadResolution(14);
  updateLEDs(false, false);
  
  Serial.println("\n=== BCI UNO R4 (STABLE SERVO PWM) ===");
}

void loop() {
  if (timerStatus && bufferReady) {
    Serial.write(packetBuffer, PACKET_LEN);
    bufferReady = false;
  }

  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    
    // Command Feedback: Flash Yellow 2
    digitalWrite(LED_YELLOW_2, HIGH); 
    
    if (cmd.startsWith("DEG ")) {
      int angle = cmd.substring(4).toInt();
      if (angle >= 0 && angle <= 180) {
        servo.write(angle);
        Serial.print("ACK_DEG: "); Serial.println(angle);
      }
    } else if (cmd == "START") {
      timerStatus = true;
      AcqTimer.start();
      updateLEDs(true, true);
      Serial.println("ACQUISITION_STARTED");
    } else if (cmd == "STOP") {
      timerStatus = false;
      AcqTimer.stop();
      updateLEDs(true, false);
      Serial.println("ACQUISITION_STOPPED");
    } else if (cmd == "WHORU") {
      Serial.println("UNO-R4-2CH-512HZ-SERVO");
      updateLEDs(true, false);
    }
    
    delay(5);
    digitalWrite(LED_YELLOW_2, LOW);
  }
}

