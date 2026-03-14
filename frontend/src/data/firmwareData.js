export const firmwares = [
  {
    id: "uno-r4-1khz",
    name: "Uno_R4_2ch_1kHz_stream.ino",
    description: "1 Channel @ 1000Hz (A0 only). Perfect for high-speed streaming. Features chaser animation.",
    content: `#include "FspTimer.h"
#include <Arduino.h>
#include <Servo.h>

// ===== CONFIGURATION =====
#define NUM_CHANNELS 1   // A0 only
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
volatile uint16_t sampleBufferA[BUFFER_SIZE];
volatile uint16_t sampleBufferB[BUFFER_SIZE];
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

  uint16_t sample = analogRead(A0);
  currentBuffer[indexCount++] = sample;

  if (indexCount >= BUFFER_SIZE) {
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
  Serial.write((uint8_t *)sendBuffer, BUFFER_SIZE * 2);
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
    Serial.println("UNO-R4-1CH-1KHZ");
  } else if (command == "START") {
    timerStart();
    Serial.println("ACQUISITION_STARTED");
  } else if (command == "STOP") {
    timerStop();
    Serial.println("ACQUISITION_STOPPED");
  } else if (command == "STATUS") {
    Serial.println(timerStatus ? "RUNNING" : "STOPPED");
  } else if (command == "CONFIG") {
    Serial.println("1 CHANNEL @ 1000 Hz (SERVO ENABLED)");
    Serial.println("CH0 = A0");
    Serial.println("BUFFER = 256");
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

  Serial.println("\\n=== BCI UNO R4 1kHz ===");
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
    String command = Serial.readStringUntil('\\n');
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
`
  },
  {
    id: "uno-r4-512hz",
    name: "Uno_R4_2ch_512Hz.ino",
    description: "2 Channels @ 512Hz (A0, A2). Standard dual-channel BCI.",
    content: `
#include "FspTimer.h"
#include <Arduino.h>

// ===== CONFIGURATION =====
#define NUM_CHANNELS 2              // A0, A2
#define HEADER_LEN 3
#define PACKET_LEN (NUM_CHANNELS * 2 + HEADER_LEN + 1) // 8 bytes
#define SAMP_RATE 512.0             // 512 Hz
#define SYNC_BYTE_1 0xC7
#define SYNC_BYTE_2 0x7C
#define END_BYTE 0x01
#define BAUD_RATE 230400

// ===== LED & SWITCH CONFIG =====
#define LED_RED_1   13  // Top 1
#define LED_RED_2   12  // Top 2

#define LED_YELLOW_1  11  // Middle 1
#define LED_YELLOW_2  10  // Middle 2

#define LED_GREEN_1   9   // Bottom 1
#define LED_GREEN_2   8   // Bottom 2

#define SW_1  4   // Button 1
#define SW_2  7   // Button 2

bool sw1 = false;
bool sw2 = false;

// ===== GLOBALS =====
uint8_t packetBuffer[PACKET_LEN];  
uint8_t ch_A0 = 0;
uint8_t ch_A2 = 2;
uint16_t adcValue = 0;
bool timerStatus = false;
bool bufferReady = false;
FspTimer ChordsTimer;

// State Variabless
bool isConnected = false; 
bool isAcquiring = false;

// ===== HELPER FUNCTIONS =====
void updateLEDs() {
  if (!isConnected) {
    // Disconnected: Red ON
    digitalWrite(LED_RED_1, HIGH);
    digitalWrite(LED_RED_2, HIGH);
    digitalWrite(LED_YELLOW_1, LOW);
    digitalWrite(LED_YELLOW_2, LOW);
    digitalWrite(LED_GREEN_1, LOW);
    digitalWrite(LED_GREEN_2, LOW);
  } 
  else if (isConnected && !isAcquiring) {
    // Connected (Idle): Yellow ON
    digitalWrite(LED_RED_1, LOW);
    digitalWrite(LED_RED_2, LOW);
    digitalWrite(LED_YELLOW_1, HIGH);
    digitalWrite(LED_YELLOW_2, HIGH);
    digitalWrite(LED_GREEN_1, LOW);
    digitalWrite(LED_GREEN_2, LOW);
  }
}

// ===== TIMER FUNCTIONS =====
bool timerStart() {
  timerStatus = true;
  isAcquiring = true;
  isConnected = true;
  updateLEDs();
  return ChordsTimer.start();
}

bool timerStop() {
  timerStatus = false;
  bufferReady = false;
  isAcquiring = false;
  updateLEDs();
  return ChordsTimer.stop();
}

void timerCallback(timer_callback_args_t __attribute((unused)) * p_args) {
  if (!timerStatus) {
    return;
  }

  // Read 2 channels (A0, A2)
  adcValue = analogRead(ch_A0);
  packetBuffer[HEADER_LEN] = highByte(adcValue);
  packetBuffer[HEADER_LEN + 1] = lowByte(adcValue);

  adcValue = analogRead(ch_A2);
  packetBuffer[HEADER_LEN + 2] = highByte(adcValue);
  packetBuffer[HEADER_LEN + 3] = lowByte(adcValue);

  // Increment counter
  packetBuffer[2]++;
  bufferReady = true;
}

bool timerBegin(float sampling_rate) {
  uint8_t timer_type = GPT_TIMER;
  int8_t timer_channel = FspTimer::get_available_timer(timer_type);
  
  if (timer_channel != -1) {
    ChordsTimer.begin(TIMER_MODE_PERIODIC, timer_type, timer_channel, sampling_rate, 0.0f, timerCallback);
    ChordsTimer.setup_overflow_irq();
    ChordsTimer.open();
    return true;
  } else {
    return false;
  }
}

// ===== DATA TRANSMISSION =====
void sendBinaryPacket() {
  Serial.write(packetBuffer, PACKET_LEN); 
}

// ===== COMMAND PROCESSING =====
void processCommand(String command) {
  command.trim();
  command.toUpperCase();

  // If we receive ANY command, we ensure we are marked connected
  if (!isConnected) {
    isConnected = true;
    updateLEDs();
  }

  if (command == "WHORU") {
    Serial.println("UNO-R4-2CH-512HZ");
  } 
  else if (command == "START") {
    timerStart();
    Serial.println("ACQUISITION_STARTED");
  } 
  else if (command == "STOP") {
    timerStop();
    Serial.println("ACQUISITION_STOPPED");
  } 
  else if (command == "STATUS") {
    Serial.println(timerStatus ? "RUNNING" : "STOPPED");
  } 
  else if (command == "CONFIG") {
    Serial.println("2 CHANNELS @ 512 Hz");
    Serial.println("CH0 = A0");
    Serial.println("CH1 = A2");
    Serial.println("PACKET_SIZE = 8 bytes");
  } 
  else {
    Serial.println("UNKNOWN_COMMAND");
  }
}

// ===== SETUP =====
void setup() {
  Serial.begin(BAUD_RATE);
  
  // LED Setup
  pinMode(LED_RED_1, OUTPUT);
  pinMode(LED_YELLOW_1, OUTPUT);
  pinMode(LED_GREEN_1, OUTPUT);
  
  pinMode(LED_RED_2, OUTPUT);
  pinMode(LED_YELLOW_2, OUTPUT);
  pinMode(LED_GREEN_2, OUTPUT);
  
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

  // Initial State: Disconnected (Red)
  isConnected = false;
  isAcquiring = false;
  updateLEDs();
  
  // Print banner
  Serial.println("\\n=== 2-CHANNEL BCI @ 512 Hz ===");
}

// ===== LED ANIMATION =====
void runChaserAnimation() {
  static unsigned long lastUpdate = 0;
  static int currentLedIdx = 0;

  const int ledPins[] = {LED_RED_1, LED_RED_2, LED_YELLOW_1, LED_YELLOW_2, LED_GREEN_1, LED_GREEN_2};

  const int numLeds = 6;
  
  if (millis() - lastUpdate > 300) { // Speed: 300ms
    lastUpdate = millis();
    
    // Turn off all
    for (int i=0; i<numLeds; i++) {
      digitalWrite(ledPins[i], LOW);
    }
    
    // Turn on current
    digitalWrite(ledPins[currentLedIdx], HIGH);
    
    // Move next
    currentLedIdx++;
    if (currentLedIdx >= numLeds) currentLedIdx = 0;
  }
}

// ===== MAIN LOOP =====
void loop() {
  // 1. LED Handling
  if (isConnected && isAcquiring) {
    runChaserAnimation();
  } else {
    // If not acquiring, ensure static state is maintained (Red/Yellow)
  }

  // 2. Data Sending
  if (timerStatus and bufferReady) {
    sendBinaryPacket();
    bufferReady = false;
  }

  // 3. Command Processing
  if (Serial.available()) {
    String command = Serial.readStringUntil('\\n');
    processCommand(command);
  }

  // 4. Switch Handling (Robust Debounce)
  static bool sw1State = LOW;
  static bool sw2State = LOW;
  static bool lastReading1 = LOW;
  static bool lastReading2 = LOW;
  static unsigned long lastDebounceTime1 = 0;
  static unsigned long lastDebounceTime2 = 0;
  unsigned long debounceDelay = 50; // 50ms stability required

  // --- Switch 1 ---
  bool reading1 = digitalRead(SW_1);
  if (reading1 != lastReading1) {
    lastDebounceTime1 = millis();
  }
  if ((millis() - lastDebounceTime1) > debounceDelay) {
    if (reading1 != sw1State) {
      sw1State = reading1;
      if (sw1State == HIGH) {
        Serial.println("MSG:SWITCH_1_PRESSED");
      }
    }
  }
  lastReading1 = reading1;

  // --- Switch 2 ---
  bool reading2 = digitalRead(SW_2);
  if (reading2 != lastReading2) {
    lastDebounceTime2 = millis();
  }
  if ((millis() - lastDebounceTime2) > debounceDelay) {
    if (reading2 != sw2State) {
      sw2State = reading2;
      if (sw2State == HIGH) {
        Serial.println("MSG:SWITCH_2_PRESSED"); 
      }
    }
  }
  lastReading2 = reading2;
}
`
  },
  {
    id: "uno-r4-512hz-servo",
    name: "Uno_R4_2ch_512Hz_Servo.ino",
    description: "2 Channels @ 512Hz with Servo outputs activated.",
    content: `
#include "FspTimer.h"
#include <Arduino.h>
#include <Servo.h>

// ===== CONFIGURATION =====
#define NUM_CHANNELS 2 // A0, A2
#define HEADER_LEN 3
#define PACKET_LEN (NUM_CHANNELS * 2 + HEADER_LEN + 1) // 8 bytes
#define SAMP_RATE 512.0                                // 512 Hz
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

FspTimer AcqTimer; // Data Acquisition (512Hz)
Servo servo;       // Servo object for stable PWM

// ===== HELPERS =====
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

// ===== TIMER FUNCTIONS =====
bool timerStart() {
  timerStatus = true;
  isAcquiring = true;
  isConnected = true;
  updateLEDs();
  return AcqTimer.start();
}

bool timerStop() {
  timerStatus = false;
  bufferReady = false;
  isAcquiring = false;
  updateLEDs();
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
    updateLEDs();
  }

  // Command Feedback: Flash Yellow 2
  digitalWrite(LED_YELLOW_2, HIGH);

  if (command.startsWith("DEG ")) {
    int angle = command.substring(4).toInt();
    if (angle >= 0 && angle <= 180) {
      servo.write(angle);
      Serial.print("ACK_DEG: ");
      Serial.println(angle);
    }
  } else if (command == "WHORU") {
    Serial.println("UNO-R4-2CH-512HZ-SERVO");
  } else if (command == "START") {
    timerStart();
    Serial.println("ACQUISITION_STARTED");
  } else if (command == "STOP") {
    timerStop();
    Serial.println("ACQUISITION_STOPPED");
  } else if (command == "STATUS") {
    Serial.println(timerStatus ? "RUNNING" : "STOPPED");
  } else if (command == "CONFIG") {
    Serial.println("2 CHANNELS @ 512 Hz (SERVO ENABLED)");
    Serial.println("CH0 = A0, CH1 = A2");
    Serial.println("SERVO PIN = 2");
    Serial.println("PACKET_SIZE = 8 bytes");
  } else {
    Serial.println("UNKNOWN_COMMAND");
  }

  delay(5);
  digitalWrite(LED_YELLOW_2, LOW);
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

  // Initial State: Disconnected (Red)
  isConnected = false;
  isAcquiring = false;
  updateLEDs();

  // Print banner
  Serial.println("\\n=== BCI UNO R4 (STABLE SERVO PWM) ===");
}

// ===== LED ANIMATION =====
void runChaserAnimation() {
  static unsigned long lastUpdate = 0;
  static int currentLedIdx = 0;
  const int ledPins[] = {LED_RED_1,    LED_RED_2,   LED_YELLOW_1,
                         LED_YELLOW_2, LED_GREEN_1, LED_GREEN_2};
  const int numLeds = 6;

  if (millis() - lastUpdate > 100) { // Fast animation for active servo version
    lastUpdate = millis();
    for (int i = 0; i < numLeds; i++)
      digitalWrite(ledPins[i], LOW);
    digitalWrite(ledPins[currentLedIdx], HIGH);
    currentLedIdx++;
    if (currentLedIdx >= numLeds)
      currentLedIdx = 0;
  }
}

// ===== MAIN LOOP =====
void loop() {
  // 1. LED Handling
  if (isConnected && isAcquiring) {
    runChaserAnimation();
  }

  // 2. Data Sending
  if (timerStatus && bufferReady) {
    sendBinaryPacket();
    bufferReady = false;
  }

  // 3. Command Processing
  if (Serial.available()) {
    String command = Serial.readStringUntil('\\n');
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
`
  },
  {
    id: "uno-r4-new",
    name: "Uno_R4_new.ino",
    description: "Multifunction Board (EMG + EEG + EOG).",
    content: `
#include "FspTimer.h"
#include <Arduino.h>

// ================== CONFIG ====================
#define NUM_CHANNELS 3         // EMG + EEG + EOG
#define HEADER_LEN 3
#define PACKET_LEN (NUM_CHANNELS*2 + HEADER_LEN + 1)  // = 3*2 + 3 + 1 = 10 bytes
#define SAMP_RATE 256.0
#define BAUD_RATE 230400

// MARKERS
#define SYNC_BYTE_1 0xAB
#define SYNC_BYTE_2 0xCD
#define END_BYTE    0xEF

// ================== GLOBALS ====================
uint8_t packetBuffer[PACKET_LEN];
uint16_t adcValue = 0;
bool bufferReady = false;
uint8_t currentChannel;
bool timerStatus = false;

FspTimer BioTimer;
uint8_t dashboardMode = 0; // 0=EMG, 1=EEG, 2=EOG

// =====================================================
// HELPER: Decide mode based on latest readings
void detectGesture(uint16_t emg, uint16_t eeg, uint16_t eog) {
  static uint32_t lastSwitch = 0;
  if (millis() - lastSwitch < 500) return;

  if (emg > 12000) { dashboardMode = 0; lastSwitch = millis(); }
  else if (eeg > 11000) { dashboardMode = 1; lastSwitch = millis(); }
  else if (eog > 10000) { dashboardMode = 2; lastSwitch = millis(); }
}

// =====================================================
void updateDashboard() {
  if (dashboardMode == 0) Serial.println("[MODE] EMG Graph");
  else if (dashboardMode == 1) Serial.println("[MODE] EEG Graph");
  else if (dashboardMode == 2) Serial.println("[MODE] EOG Blink");
}

// ================= TIMER CALLBACK ====================
void timerCallback(timer_callback_args_t * unused) {
  for (currentChannel = 0; currentChannel < NUM_CHANNELS; currentChannel++) {
    adcValue = analogRead(currentChannel);
    packetBuffer[(currentChannel * 2) + HEADER_LEN] = highByte(adcValue);
    packetBuffer[(currentChannel * 2) + HEADER_LEN + 1] = lowByte(adcValue);
  }

  uint16_t emg = (packetBuffer[3] << 8) | packetBuffer[4];
  uint16_t eeg = (packetBuffer[5] << 8) | packetBuffer[6];
  uint16_t eog = (packetBuffer[7] << 8) | packetBuffer[8];

  detectGesture(emg, eeg, eog);

  packetBuffer[2]++;  
  bufferReady = true;
}

// ================= TIMER START ====================
bool timerBegin(float rate) {
  uint8_t t = GPT_TIMER;
  int8_t ch = FspTimer::get_available_timer(t);

  if (ch == -1) return false;
  BioTimer.begin(TIMER_MODE_PERIODIC, t, ch, rate, 0.0f, timerCallback);
  BioTimer.setup_overflow_irq();
  BioTimer.open();
  return true;
}

// ================== SEND PACKET ====================
void sendPacket() { Serial.write(packetBuffer, PACKET_LEN); }

// ================= COMMAND HANDLER ==================
void processCommand(String c) {
  c.trim(); c.toUpperCase();
  if (c == "START") { timerStatus = true; Serial.println("ACQ STARTED"); }
  else if (c == "STOP") { timerStatus = false; Serial.println("ACQ STOPPED"); }
  else if (c == "MODE") { updateDashboard(); }
  else if (c == "STATUS") { Serial.println(timerStatus ? "RUNNING" : "STOPPED"); }
}

// ===================== SETUP =======================
void setup() {
  Serial.begin(BAUD_RATE);
  while (!Serial) {}

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  packetBuffer[0] = SYNC_BYTE_1;
  packetBuffer[1] = SYNC_BYTE_2;
  packetBuffer[2] = 0;
  packetBuffer[PACKET_LEN-1] = END_BYTE;

  analogReadResolution(14);
  timerBegin(SAMP_RATE);

  Serial.println("\\n=== BIOSIGNAL DASHBOARD ===");
  Serial.println("[CH0] EMG  (Muscle)");
  Serial.println("[CH1] EEG  (Brain)");
  Serial.println("[CH2] EOG  (Eye)");
  Serial.println("===========================");
}

// ===================== LOOP ========================
void loop() {
  if (timerStatus && bufferReady) {
    sendPacket();
    bufferReady = false;
  }

  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    processCommand(cmd);
  }
}
`
  },
  {
    id: "rock-paper-scissors",
    name: "RockPaperScissors.ino",
    description: "Built-in Rock Paper Scissors code test.",
    content: `
/*
  Rock Paper Scissors Game for Arduino
  
  Instructions:
  1. Upload this sketch to your Arduino.
  2. Open the Serial Monitor (Tools > Serial Monitor).
  3. Set Baud Rate to 9600.
  4. Type 'R', 'P', or 'S' (or 'r', 'p', 's') and hit Enter to play.
*/

const char ROCK = 'r';
const char PAPER = 'p';
const char SCISSORS = 's';

void setup() {
  Serial.begin(9600);
  randomSeed(analogRead(0)); // Seed random number generator with unconnected pin noise
  
  while (!Serial) {
    ; // wait for serial port to connect. Needed for native USB port only
  }
  
  Serial.println("Welcome to Rock, Paper, Scissors!");
  Serial.println("Enter 'R' for Rock, 'P' for Paper, or 'S' for Scissors.");
  Serial.println("-------------------------------------------------------");
}

void loop() {
  if (Serial.available() > 0) {
    char userChoice = tolower(Serial.read());
    
    // Ignore newline characters or carriage returns often sent by Serial Monitor
    if (userChoice == '\\n' || userChoice == '\\r' || userChoice == ' ') {
      return;
    }

    if (isValidChoice(userChoice)) {
      char computerChoice = getComputerChoice();
      
      Serial.print("You chose: ");
      printChoice(userChoice);
      Serial.print("\\tComputer chose: ");
      printChoice(computerChoice);
      
      determineWinner(userChoice, computerChoice);
      Serial.println("-------------------------------------------------------");
      Serial.println("Play again? (Enter R, P, or S)");
    } else {
      Serial.println("Invalid input! Please enter R, P, or S.");
    }
  }
}

boolean isValidChoice(char choice) {
  return (choice == ROCK || choice == PAPER || choice == SCISSORS);
}

char getComputerChoice() {
  int randNum = random(0, 3);
  switch (randNum) {
    case 0: return ROCK;
    case 1: return PAPER;
    case 2: return SCISSORS;
  }
  return ROCK; // Should not reach here
}

void printChoice(char choice) {
  if (choice == ROCK) Serial.print("Rock");
  else if (choice == PAPER) Serial.print("Paper");
  else if (choice == SCISSORS) Serial.print("Scissors");
}

void determineWinner(char user, char computer) {
  if (user == computer) {
    Serial.println("\\nIt's a Tie!");
  } 
  else if ((user == ROCK && computer == SCISSORS) ||
           (user == PAPER && computer == ROCK) ||
           (user == SCISSORS && computer == PAPER)) {
    Serial.println("\\nYou Win!");
  } 
  else {
    Serial.println("\\nComputer Wins!");
  }
}
`
  }
];
