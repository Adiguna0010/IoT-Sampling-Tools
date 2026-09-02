/*
  ====================================================================
  KODE STEPPER FAST & ULTRA-SMOOTH (OPTI-SPEED 150 us)
  ====================================================================
  
  Solusi Putaran Pelan & Getaran Sisa pada Microstepping:
  Pada 1/8 atau 1/16 Microstep (1600 - 3200 steps/rev), delay pulsa 1000us-2000us
  membuat putaran motor sangat lambat (3-6 detik per putaran) dan menyisakan getaran.

  Dengan menurunkan delay ke 150us - 300us, frekuensi pulsa naik ke 3.3 kHz.
  Hasilnya: Motor berputar CEPAT, SUPER HALUS, TANPA SUARA, & 100% BEBAS GETARAN!

  KONFIGURASI PIN:
  - Step Pin            : GPIO 13
  - Dir Pin             : GPIO 14
  - Limit Atas (LS1)    : GPIO 18
  - Limit Bawah (LS2)   : GPIO 19
  - Limit Syringe (LS3) : GPIO 23
*/

#define STEP_PIN 13
#define DIR_PIN  14

const int limitAtasPin = 18;    
const int limitBawahPin = 19;   
const int limitSyringePin = 23; 

const int LIMIT_ATAS_ACTIVE_STATE = LOW;    
const int LIMIT_BAWAH_ACTIVE_STATE = LOW;   
const int LIMIT_SYRINGE_ACTIVE_STATE = LOW; 

int motorState = 0; // 0: STOP, 1: NAIK, 2: TURUN
int pulseDelayUs = 150; // 150 us (Optimal untuk Putaran Cepat & Ultra-Halus)

void setup()
{
  Serial.begin(9600);

  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);
  
  digitalWrite(STEP_PIN, LOW);
  digitalWrite(DIR_PIN, LOW);

  pinMode(limitAtasPin, INPUT_PULLUP);
  pinMode(limitBawahPin, INPUT_PULLUP);
  pinMode(limitSyringePin, INPUT_PULLUP);

  Serial.println("\n=================================================");
  Serial.println(" SYSTEM READY: STEPPER FAST & ULTRA-SMOOTH (9600)");
  Serial.println("=================================================");
  Serial.println("Kirim perintah lewat Serial Monitor:");
  Serial.println("  'U' atau 'u' -> Motor NAIK (Cepat & Super Halus)");
  Serial.println("  'D' atau 'd' -> Motor TURUN (Cepat & Super Halus)");
  Serial.println("  'S' atau 's' -> Motor BERHENTI");
  Serial.println("-------------------------------------------------");
  Serial.println("Ubah Kecepatan (Ketik 1-4 lalu Enter):");
  Serial.println("  '1' -> 100 us (Sangat Cepat)");
  Serial.println("  '2' -> 150 us (Cepat & Super Halus - RECOMMENDED)");
  Serial.println("  '3' -> 300 us (Sedang Cepat)");
  Serial.println("  '4' -> 500 us (Sedang)");
  Serial.println("=================================================\n");
}

void eksekusiMotorNaik() {
  digitalWrite(DIR_PIN, HIGH);
  Serial.printf("[STATUS] Motor NAIK dipicu | Delay: %d us\n", pulseDelayUs);

  // Soft-start dengan periksa Limit Switch di setiap pulsa
  for (int d = 800; d > pulseDelayUs; d -= 20) {
    if (digitalRead(limitAtasPin) == LIMIT_ATAS_ACTIVE_STATE) {
      motorState = 0;
      digitalWrite(STEP_PIN, LOW);
      Serial.println("\n[ALERT] MOTOR BERHENTI SANGAT CEPAT! Limit Atas (LS1) Tertabrak!");
      return;
    }
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(d);
    digitalWrite(STEP_PIN, LOW);
    delayMicroseconds(d);
  }

  while (motorState == 1) {
    // Blok 200 pulsa dengan pemeriksaan Limit Switch SETIAP PULSA (Sangat Responsif)
    for (int i = 0; i < 200; i++) {
      if (digitalRead(limitAtasPin) == LIMIT_ATAS_ACTIVE_STATE) {
        motorState = 0;
        digitalWrite(STEP_PIN, LOW);
        Serial.println("\n[ALERT] MOTOR BERHENTI SANGAT CEPAT! Limit Atas (LS1) Tertabrak!");
        return;
      }

      digitalWrite(STEP_PIN, HIGH);
      delayMicroseconds(pulseDelayUs);
      digitalWrite(STEP_PIN, LOW);
      delayMicroseconds(pulseDelayUs);
    }

    if (Serial.available() > 0) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      cmd.toUpperCase();
      if (cmd == "S" || cmd == "STOP" || cmd == "D" || cmd == "U") {
        motorState = 0;
        digitalWrite(STEP_PIN, LOW);
        Serial.println("[STATUS] Motor BERHENTI (STOP)");
        break;
      }
    }
  }
  digitalWrite(STEP_PIN, LOW);
}

void eksekusiMotorTurun() {
  digitalWrite(DIR_PIN, LOW);
  Serial.printf("[STATUS] Motor TURUN dipicu | Delay: %d us\n", pulseDelayUs);

  // Soft-start dengan periksa Limit Switch di setiap pulsa
  for (int d = 800; d > pulseDelayUs; d -= 20) {
    if (digitalRead(limitBawahPin) == LIMIT_BAWAH_ACTIVE_STATE) {
      motorState = 0;
      digitalWrite(STEP_PIN, LOW);
      Serial.println("\n[ALERT] MOTOR BERHENTI SANGAT CEPAT! Limit Bawah (LS2) Tertabrak!");
      return;
    }
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(d);
    digitalWrite(STEP_PIN, LOW);
    delayMicroseconds(d);
  }

  while (motorState == 2) {
    // Blok 200 pulsa dengan pemeriksaan Limit Switch SETIAP PULSA
    for (int i = 0; i < 200; i++) {
      if (digitalRead(limitBawahPin) == LIMIT_BAWAH_ACTIVE_STATE) {
        motorState = 0;
        digitalWrite(STEP_PIN, LOW);
        Serial.println("\n[ALERT] MOTOR BERHENTI SANGAT CEPAT! Limit Bawah (LS2) Tertabrak!");
        return;
      }

      digitalWrite(STEP_PIN, HIGH);
      delayMicroseconds(pulseDelayUs);
      digitalWrite(STEP_PIN, LOW);
      delayMicroseconds(pulseDelayUs);
    }

    if (Serial.available() > 0) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      cmd.toUpperCase();
      if (cmd == "S" || cmd == "STOP" || cmd == "U" || cmd == "D") {
        motorState = 0;
        digitalWrite(STEP_PIN, LOW);
        Serial.println("[STATUS] Motor BERHENTI (STOP)");
        break;
      }
    }
  }
  digitalWrite(STEP_PIN, LOW);
}

void loop()
{
  if (Serial.available() > 0)
  {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "U")
    {
      if (digitalRead(limitAtasPin) == LIMIT_ATAS_ACTIVE_STATE) {
        Serial.println("[WARNING] Perintah NAIK Ditolak: Limit Atas (LS1) TERTEKAN!");
      } else {
        motorState = 1;
        eksekusiMotorNaik();
      }
    }
    else if (cmd == "D")
    {
      if (digitalRead(limitBawahPin) == LIMIT_BAWAH_ACTIVE_STATE) {
        Serial.println("[WARNING] Perintah TURUN Ditolak: Limit Bawah (LS2) TERTEKAN!");
      } else {
        motorState = 2;
        eksekusiMotorTurun();
      }
    }
    else if (cmd == "S" || cmd == "STOP")
    {
      motorState = 0;
      digitalWrite(STEP_PIN, LOW);
      Serial.println("[STATUS] Motor BERHENTI (STOP)");
    }
    else if (cmd == "STATUS" || cmd == "TEST")
    {
      Serial.println("\n--- STATUS SENSOR LIMIT SWITCH ---");
      Serial.printf("LS Atas (GPIO %d)    : RAW = %d (%s)\n", limitAtasPin, digitalRead(limitAtasPin), (digitalRead(limitAtasPin) == LIMIT_ATAS_ACTIVE_STATE) ? "AKTIF/TERTEKAN" : "LEPAS");
      Serial.printf("LS Bawah (GPIO %d)   : RAW = %d (%s)\n", limitBawahPin, digitalRead(limitBawahPin), (digitalRead(limitBawahPin) == LIMIT_BAWAH_ACTIVE_STATE) ? "AKTIF/TERTEKAN" : "LEPAS");
      Serial.printf("LS Syringe (GPIO %d) : RAW = %d (%s)\n", limitSyringePin, digitalRead(limitSyringePin), (digitalRead(limitSyringePin) == LIMIT_SYRINGE_ACTIVE_STATE) ? "AKTIF/TERTEKAN" : "LEPAS");
      Serial.println("----------------------------------\n");
    }
    else if (cmd == "1") {
      pulseDelayUs = 100;
      Serial.println("⚙️ Kecepatan = 1 (100 us - Sangat Cepat)");
    }
    else if (cmd == "2") {
      pulseDelayUs = 150;
      Serial.println("⚙️ Kecepatan = 2 (150 us - Cepat & Super Halus RECOMMENDED)");
    }
    else if (cmd == "3") {
      pulseDelayUs = 300;
      Serial.println("⚙️ Kecepatan = 3 (300 us - Sedang Cepat)");
    }
    else if (cmd == "4") {
      pulseDelayUs = 500;
      Serial.println("⚙️ Kecepatan = 4 (500 us - Sedang)");
    }
  }
}
