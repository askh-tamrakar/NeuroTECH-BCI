#include "FspTimer.h"
#include <Arduino.h>

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

// ===== SERVO PWM CONSTANTS (100kHz Tick = 10us) =====
#define SERVO_HZ 50.0
#define SERVO_PERIOD_TICKS 2000 // 2000 * 10us = 20ms (50Hz)
#define TICKS_PER_DEG 0.555      // (2000us-1000us)/180 = 5.5us per deg -> approx 0.55 ticks
#define TICKS_OFFSET 100        // 1000us = 100 ticks

// ===== GLOBALS =====
uint8_t packetBuffer[PACKET_LEN];  
volatile bool timerStatus = false;
volatile bool bufferReady = false;

FspTimer AcqTimer;   // Data Acquisition (512Hz)
FspTimer ServoTimer; // Servo PWM Generator (100kHz)

volatile int servo_ticks_target = 150; // default 1500us (90 deg)
volatile int servo_counter = 0;

// ===== SERVO INTERRUPT (100kHz) =====
// This runs every 10 microseconds. Non-blocking.
void servoTimerCallback(timer_callback_args_t __attribute((unused)) * p_args) {
  servo_counter++;
  
  if (servo_counter >= SERVO_PERIOD_TICKS) {
    digitalWrite(SERVO_PIN, HIGH);
    servo_counter = 0;
  } 
  else if (servo_counter == servo_ticks_target) {
    digitalWrite(SERVO_PIN, LOW);
  }
}

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

  // 2. Setup Servo PWM Timer (100kHz)
  // Higher frequency for smooth, non-blocking 10us resolution
  int ch_servo = FspTimer::get_available_timer(type);
  ServoTimer.begin(TIMER_MODE_PERIODIC, type, ch_servo, 100000.0f, 0.0f, servoTimerCallback);
  ServoTimer.setup_overflow_irq();
  ServoTimer.open();
  ServoTimer.start(); // Servo pulse stream starts now

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
        // Map 0-180 angle to ticks (100 ticks = 1ms, 200 ticks = 2ms)
        // 100 ticks + angle * 0.555
        servo_ticks_target = 100 + (int)(angle * 0.555);
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
