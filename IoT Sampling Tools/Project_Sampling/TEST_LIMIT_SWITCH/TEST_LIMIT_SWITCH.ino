/*
  ====================================================================
  KODE DIAGNOSTIK / TEST LIMIT SWITCH & MOTOR STEPPER (SMART CHAMBER)
  ====================================================================
  
  Kode ini digunakan khusus untuk mendeteksi status Limit Switch (LS):
  - Limit Atas (LS1)    : Pin GPIO 25
  - Limit Bawah (LS2)   : Pin GPIO 26
  - Limit Syringe (LS3) : Pin GPIO 27
  
  Serta menguji pergerakan Motor Stepper:
  - Step Pin            : Pin GPIO 13
  - Dir Pin             : Pin GPIO 14
  
  Cara Penggunaan:
  1. Upload program ini ke ESP32.
  2. Buka Serial Monitor (Set Baud Rate ke 115200).
  3. Tekan/lepas Limit Switch secara manual dengan tangan.
  4. Perhatikan perubahan nilai RAW (0 atau 1) di Serial Monitor:
     - Jika saat DILEPAS bernilai 1, dan saat DITEKAN bernilai 0:
       Artinya LS Anda bertipe ACTIVE LOW (NO dengan Pull-Up).
     - Jika saat DILEPAS bernilai 0, dan saat DITEKAN bernilai 1:
       Artinya LS Anda bertipe ACTIVE HIGH (NC dengan Pull-Up atau ada tegangan eksternal).
  5. Kirim perintah lewat Serial Monitor untuk menguji motor:
     - 'U' : Jalankan motor NAIK (Up)
     - 'D' : Jalankan motor TURUN (Down)
     - 'S' : Hentikan motor (Stop)
*/

// ================= KONFIGURASI PIN =================
const int limitAtasPin = 18;    
const int limitBawahPin = 19;   
const int limitSyringePin = 23; 

const int stepPin = 13;  
const int dirPin = 14;   

// ================= KONFIGURASI AKTIF LIMIT SWITCH =================
// CATATAN: Sesuaikan dengan tipe limit switch Anda.
// - Set ke LOW jika saat ditekan terbaca 0 (GND)
// - Set ke HIGH jika saat ditekan terbaca 1 (VCC)
const int LIMIT_ATAS_ACTIVE_STATE = LOW;    // Ubah ke HIGH jika aktif saat bernilai 1 (HIGH)
const int LIMIT_BAWAH_ACTIVE_STATE = LOW;   // Ubah ke HIGH jika aktif saat bernilai 1 (HIGH)
const int LIMIT_SYRINGE_ACTIVE_STATE = LOW; // Ubah ke HIGH jika aktif saat bernilai 1 (HIGH)

// Mode Input:
// Gunakan INPUT_PULLUP jika saklar langsung dihubungkan ke GND.
// Gunakan INPUT jika Anda menggunakan pull-up eksternal / optocoupler / catu daya terpisah yang sudah ada pull-up nya.
const int INPUT_MODE = INPUT_PULLUP; 

// ================= VARIABEL STATE =================
int motorState = 0; // 0 = Stop, 1 = Naik (Up), 2 = Turun (Down)
unsigned long lastPrintTime = 0;
const unsigned long printInterval = 500; // Cetak status setiap 500 ms

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=============================================");
  Serial.println("  ESP32 LIMIT SWITCH & MOTOR TEST UTILITY  ");
  Serial.println("=============================================");
  
  // Inisialisasi Pin Limit Switch
  pinMode(limitAtasPin, INPUT_MODE);
  pinMode(limitBawahPin, INPUT_MODE);
  pinMode(limitSyringePin, INPUT_MODE);
  
  // Inisialisasi Pin Motor
  pinMode(stepPin, OUTPUT);
  pinMode(dirPin, OUTPUT);
  
  digitalWrite(stepPin, LOW);
  digitalWrite(dirPin, LOW);
  
  Serial.printf("Mode Input Limit Switch: %s\n", (INPUT_MODE == INPUT_PULLUP) ? "INPUT_PULLUP (Internal Pull-Up)" : "INPUT (Biasa/Eksternal)");
  Serial.println("Kirim perintah berikut lewat Serial Monitor:");
  Serial.println("  'U' atau 'u' -> Motor NAIK (Up)");
  Serial.println("  'D' atau 'd' -> Motor TURUN (Down)");
  Serial.println("  'S' atau 's' -> Hentikan Motor (Stop)");
  Serial.println("---------------------------------------------");
}

void loop() {
  // 1. Membaca Serial Command
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    // Bersihkan buffer serial
    while(Serial.available() > 0) Serial.read();
    
    if (cmd == 'U' || cmd == 'u') {
      Serial.println("\n[COMMAND] Perintah NAIK diterima.");
      int rawAtas = digitalRead(limitAtasPin);
      if (rawAtas == LIMIT_ATAS_ACTIVE_STATE) {
        Serial.println("[WARNING] Gagal NAIK: Limit Atas terdeteksi AKTIF!");
        motorState = 0;
      } else {
        motorState = 1;
        digitalWrite(dirPin, HIGH);
        Serial.println("[STATUS] Motor berjalan NAIK...");
      }
    } 
    else if (cmd == 'D' || cmd == 'd') {
      Serial.println("\n[COMMAND] Perintah TURUN diterima.");
      int rawBawah = digitalRead(limitBawahPin);
      if (rawBawah == LIMIT_BAWAH_ACTIVE_STATE) {
        Serial.println("[WARNING] Gagal TURUN: Limit Bawah terdeteksi AKTIF!");
        motorState = 0;
      } else {
        motorState = 2;
        digitalWrite(dirPin, LOW);
        Serial.println("[STATUS] Motor berjalan TURUN...");
      }
    } 
    else if (cmd == 'S' || cmd == 's') {
      Serial.println("\n[COMMAND] Perintah STOP diterima.");
      motorState = 0;
      Serial.println("[STATUS] Motor BERHENTI.");
    }
  }

  // 2. Baca Status Sensor (Real-time & Tampilkan berkala)
  int rawAtas = digitalRead(limitAtasPin);
  int rawBawah = digitalRead(limitBawahPin);
  int rawSyringe = digitalRead(limitSyringePin);

  bool isAtasActive = (rawAtas == LIMIT_ATAS_ACTIVE_STATE);
  bool isBawahActive = (rawBawah == LIMIT_BAWAH_ACTIVE_STATE);
  bool isSyringeActive = (rawSyringe == LIMIT_SYRINGE_ACTIVE_STATE);

  // Proteksi Motor Real-time jika menabrak Limit Switch
  if (motorState == 1 && isAtasActive) {
    motorState = 0;
    Serial.println("\n[ALERT] MOTOR BERHENTI! Limit Atas (LS1) tertabrak (AKTIF)!");
  }
  else if (motorState == 2 && isBawahActive) {
    motorState = 0;
    Serial.println("\n[ALERT] MOTOR BERHENTI! Limit Bawah (LS2) tertabrak (AKTIF)!");
  }

  // Tampilkan status limit switch ke serial monitor setiap interval tertentu
  if (millis() - lastPrintTime >= printInterval) {
    lastPrintTime = millis();
    
    Serial.print("LS Atas (GPIO 25): ");
    Serial.print(rawAtas);
    Serial.print(isAtasActive ? " [AKTIF!]" : " [OFF]");
    
    Serial.print(" | LS Bawah (GPIO 26): ");
    Serial.print(rawBawah);
    Serial.print(isBawahActive ? " [AKTIF!]" : " [OFF]");
    
    Serial.print(" | LS Syringe (GPIO 27): ");
    Serial.print(rawSyringe);
    Serial.println(isSyringeActive ? " [AKTIF!]" : " [OFF]");
  }

  // 3. Jalankan Motor (jika motorState != 0)
  if (motorState != 0) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(500); // Kecepatan motor (jeda antar pulsa)
    digitalWrite(stepPin, LOW);
    delayMicroseconds(500);
  }
}
