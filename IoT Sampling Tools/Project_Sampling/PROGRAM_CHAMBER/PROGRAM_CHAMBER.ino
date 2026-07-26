#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

// ================= KONFIGURASI WIFI & SERVER =================
const char* ssid = "ChamberBase";
const char* password = "chamber123";
const char* serverUrl = "https://iot-chamber-backend.vercel.app/api/data"; 

// ================= KONFIGURASI PIN =================
#define SDA_PIN           21
#define SCL_PIN           22

#define MQ4_1_PIN         32  
#define MQ4_2_PIN         33  
#define MQ4_3_PIN         34  

#define RELAY_KIPAS_PIN   4  

const int dirPin = 14;   
const int stepPin = 13;  
const int limitAtasPin = 18;    
const int limitBawahPin = 19;   
const int limitSyringePin = 23; 

// ================= KONFIGURASI LOGIKA & DIAGNOSTIK =================
// Sesuaikan dengan tipe saklar Anda:
// - Set ke LOW jika tipe NO (Normally Open / Terhubung GND saat ditekan)
// - Set ke HIGH jika tipe NC (Normally Closed / Terlepas dari GND saat ditekan)
const int LIMIT_ATAS_ACTIVE_STATE = LOW;    // Jika motor nabrak terus, coba ubah ke HIGH atau LOW
const int LIMIT_BAWAH_ACTIVE_STATE = LOW;
const int LIMIT_SYRINGE_ACTIVE_STATE = LOW;
const bool KIPAS_ACTIVE_HIGH = false;        // Set ke true jika relay aktif ketika diberikan sinyal HIGH

// Variabel untuk melacak status limit switch sebelumnya (untuk diagnosa perubahan)
int lastAtasState = -1;
int lastBawahState = -1;
int lastSyringeState = -1;

// Helper untuk memeriksa perintah di respon JSON secara fleksibel
bool checkCommand(String resp, String key, String val) {
  if (resp.indexOf("\"" + key + "\":\"" + val + "\"") >= 0) return true;
  if (resp.indexOf("\"" + key + "\": \"" + val + "\"") >= 0) return true;
  if (resp.indexOf("\"" + key + "\":" + val) >= 0) return true;
  if (resp.indexOf("\"" + key + "\": " + val) >= 0) return true;
  return false;
}

void checkLimitSwitchStatusChanges() {
  int currentAtas = digitalRead(limitAtasPin);
  int currentBawah = digitalRead(limitBawahPin);
  int currentSyringe = digitalRead(limitSyringePin);
  
  if (currentAtas != lastAtasState) {
    Serial.printf("[DIAGNOSTIC] Limit Atas (Pin %d) berubah: %s (RAW: %d)\n", 
                  limitAtasPin, currentAtas == LIMIT_ATAS_ACTIVE_STATE ? "TERTEKAN (ACTIVE)" : "TERLEPAS (INACTIVE)", currentAtas);
    lastAtasState = currentAtas;
  }
  if (currentBawah != lastBawahState) {
    Serial.printf("[DIAGNOSTIC] Limit Bawah (Pin %d) berubah: %s (RAW: %d)\n", 
                  limitBawahPin, currentBawah == LIMIT_BAWAH_ACTIVE_STATE ? "TERTEKAN (ACTIVE)" : "TERLEPAS (INACTIVE)", currentBawah);
    lastBawahState = currentBawah;
  }
  if (currentSyringe != lastSyringeState) {
    Serial.printf("[DIAGNOSTIC] Limit Syringe (Pin %d) berubah: %s (RAW: %d)\n", 
                  limitSyringePin, currentSyringe == LIMIT_SYRINGE_ACTIVE_STATE ? "TERTEKAN (ACTIVE)" : "TERLEPAS (INACTIVE)", currentSyringe);
    lastSyringeState = currentSyringe;
  }
}

// ================= VARIABEL GLOBAL =================
Adafruit_BME280 bmeAtas;  
Adafruit_BME280 bmeBawah; 

String command = "";
int motorState = 0; 
int fanState = 0;   

TaskHandle_t TaskSensorWiFi; 

// ================= FUNGSI ANTI-NOISE LIMIT SWITCH =================
bool bacaSensorStabil(int pin, int targetState) {
  int hitunganBenar = 0;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(pin) == targetState) hitunganBenar++;
    delayMicroseconds(100); 
  }
  return (hitunganBenar >= 4); 
}

// ================= FUNGSI KONVERSI MQ-4 KE PPM (SIMPEL) =================
int hitungPPM(int nilaiAnalog) {
  return map(nilaiAnalog, 0, 4095, 0, 10000); 
}

// ================= TUGAS CORE 0 (SENSOR & WIFI) =================
void taskSensorDanWiFi(void * pvParameters) {
  for(;;) {
    // PERUBAHAN: Jeda diubah menjadi 3 detik (3000 ms)
    vTaskDelay(3000 / portTICK_PERIOD_MS); 

    // --- PENGAMBILAN SAMPLE 1 ---
    float t1_a = bmeAtas.readTemperature();
    float h1_a = bmeAtas.readHumidity();
    float p1_a = bmeAtas.readPressure() / 100.0F;
    int mq1_1 = hitungPPM(analogRead(MQ4_1_PIN));
    int mq1_2 = hitungPPM(analogRead(MQ4_2_PIN));
    int mq1_3 = hitungPPM(analogRead(MQ4_3_PIN));

    float t1_b = bmeBawah.readTemperature();
    float h1_b = bmeBawah.readHumidity();
    float p1_b = bmeBawah.readPressure() / 100.0F;

    // Proteksi anti-NaN jika sensor belum terpasang / terputus
    if (isnan(t1_a)) t1_a = 0.0;
    if (isnan(h1_a)) h1_a = 0.0;
    if (isnan(p1_a)) p1_a = 0.0;
    if (isnan(t1_b)) t1_b = 0.0;
    if (isnan(h1_b)) h1_b = 0.0;
    if (isnan(p1_b)) p1_b = 0.0;

    vTaskDelay(2000 / portTICK_PERIOD_MS); // Jeda 2 detik antar sample

    // --- PENGAMBILAN SAMPLE 2 ---
    float t2_a = bmeAtas.readTemperature();
    float h2_a = bmeAtas.readHumidity();
    float p2_a = bmeAtas.readPressure() / 100.0F;
    int mq2_1 = hitungPPM(analogRead(MQ4_1_PIN));
    int mq2_2 = hitungPPM(analogRead(MQ4_2_PIN));
    int mq2_3 = hitungPPM(analogRead(MQ4_3_PIN));

    float t2_b = bmeBawah.readTemperature();
    float h2_b = bmeBawah.readHumidity();
    float p2_b = bmeBawah.readPressure() / 100.0F;

    // Proteksi anti-NaN jika sensor belum terpasang / terputus
    if (isnan(t2_a)) t2_a = 0.0;
    if (isnan(h2_a)) h2_a = 0.0;
    if (isnan(p2_a)) p2_a = 0.0;
    if (isnan(t2_b)) t2_b = 0.0;
    if (isnan(h2_b)) h2_b = 0.0;
    if (isnan(p2_b)) p2_b = 0.0;

    // --- KALKULASI RATA-RATA ---
    float avgSuhu = (t1_a + t1_b + t2_a + t2_b) / 4.0;
    float avgKelembaban = (h1_a + h1_b + h2_a + h2_b) / 4.0;
    float avgTekanan = (p1_a + p1_b + p2_a + p2_b) / 4.0;
    int avgGasPPM = (mq1_1 + mq1_2 + mq1_3 + mq2_1 + mq2_2 + mq2_3) / 6;
    int isSyringePresent = bacaSensorStabil(limitSyringePin, LIMIT_SYRINGE_ACTIVE_STATE) ? 1 : 0;
    int isLimitAtas = bacaSensorStabil(limitAtasPin, LIMIT_ATAS_ACTIVE_STATE) ? 1 : 0;
    int isLimitBawah = bacaSensorStabil(limitBawahPin, LIMIT_BAWAH_ACTIVE_STATE) ? 1 : 0;

    // --- TAMPILKAN KE SERIAL MONITOR ---
    Serial.println("\n=== HASIL PEMBACAAN SENSOR ===");
    Serial.printf("BME280 Atas  - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", t2_a, h2_a, p2_a);
    Serial.printf("BME280 Bawah - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", t2_b, h2_b, p2_b);
    Serial.printf("MQ-4 Sensor 1: %d PPM | Sensor 2: %d PPM | Sensor 3: %d PPM\n", mq2_1, mq2_2, mq2_3);
    Serial.println("--- NILAI AVERAGE (DIKIRIM KE SERVER) ---");
    Serial.printf("Suhu: %.2f | Kelembaban: %.2f | Tekanan: %.2f | Gas: %d PPM\n", avgSuhu, avgKelembaban, avgTekanan, avgGasPPM);
    Serial.println("--- STATUS LIMIT SWITCH ---");
    Serial.printf("Limit Atas (LS1)    : %s (RAW: %d)\n", isLimitAtas ? "TERTEKAN" : "TERLEPAS", digitalRead(limitAtasPin));
    Serial.printf("Limit Bawah (LS2)   : %s (RAW: %d)\n", isLimitBawah ? "TERTEKAN" : "TERLEPAS", digitalRead(limitBawahPin));
    Serial.printf("Limit Syringe (LS3) : %s (RAW: %d)\n", isSyringePresent ? "TERTEKAN" : "TERLEPAS", digitalRead(limitSyringePin));
    Serial.println("================================\n");

    // --- FORMAT JSON ---
    String jsonPayload = "{";
    jsonPayload += "\"device\": \"Chamber 1\", ";
    jsonPayload += "\"suhu\": " + String(avgSuhu, 2) + ", ";
    jsonPayload += "\"kelembaban\": " + String(avgKelembaban, 2) + ", ";
    jsonPayload += "\"tekanan\": " + String(avgTekanan, 2) + ", ";
    jsonPayload += "\"gas_metana\": " + String(avgGasPPM) + ", "; 
    jsonPayload += "\"syringe_present\": " + String(isSyringePresent);
    jsonPayload += "}";

    // --- KIRIM HTTP POST JIKA WIFI TERHUBUNG ---
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client;
      client.setInsecure(); // Mengabaikan verifikasi SSL untuk Vercel HTTPS
      HTTPClient http;
      http.begin(client, serverUrl);
      http.addHeader("Content-Type", "application/json");
      int httpResponseCode = http.POST(jsonPayload);
      
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.printf("Data terkirim! HTTP: %d\n", httpResponseCode);
        
        // Membaca perintah dari server dengan pencocokan JSON yang toleran
        if (checkCommand(response, "command_value", "1")) prosesPerintah("1");
        if (checkCommand(response, "command_value", "0")) prosesPerintah("0");
        if (checkCommand(response, "command_value", "U")) prosesPerintah("U");
        if (checkCommand(response, "command_value", "D")) prosesPerintah("D");
        if (checkCommand(response, "command_value", "S")) prosesPerintah("S");
      } else {
        Serial.printf("Gagal mengirim data. Error: %s\n", http.errorToString(httpResponseCode).c_str());
      }
      http.end();
    } else {
      Serial.println("WiFi terputus! Gagal mengirim data.");
    }
  }
}

// ================= FUNGSI PROSES PERINTAH =================
void prosesPerintah(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  
  bool syringeTerpasang = bacaSensorStabil(limitSyringePin, LIMIT_SYRINGE_ACTIVE_STATE);

  if (cmd == "1") {
    digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? HIGH : LOW);
    fanState = 1;
    Serial.println("Status: Kipas ON");
  } else if (cmd == "0") {
    digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? LOW : HIGH);
    fanState = 0;
    Serial.println("Status: Kipas OFF");
  } else if (!syringeTerpasang && (cmd == "U" || cmd == "D")) {
    Serial.println("PROSES DITOLAK: Syringe belum terpasang!");
  } else if (cmd == "U") {
    if (!bacaSensorStabil(limitAtasPin, LIMIT_ATAS_ACTIVE_STATE)) { 
      motorState = 1;
      digitalWrite(dirPin, HIGH);
      Serial.println("Status: Motor NAIK (Up)");
    } else {
      Serial.println("Gerak NAIK ditolak: Limit Atas terdeteksi!");
    }
  } else if (cmd == "D") {
    if (!bacaSensorStabil(limitBawahPin, LIMIT_BAWAH_ACTIVE_STATE)) { 
      motorState = 2;
      digitalWrite(dirPin, LOW);
      Serial.println("Status: Motor TURUN (Down)");
    } else {
      Serial.println("Gerak TURUN ditolak: Limit Bawah terdeteksi!");
    }
  } else if (cmd == "S" || cmd == "STOP") {
    motorState = 0;
    Serial.println("Status: Motor BERHENTI");
  }
}

// ================= SETUP UTAMA =================
void setup() {
  Serial.begin(9600);
  
  // Inisialisasi Pin
  pinMode(dirPin, OUTPUT);
  pinMode(stepPin, OUTPUT);
  pinMode(limitAtasPin, INPUT_PULLUP);
  pinMode(limitBawahPin, INPUT_PULLUP);
  pinMode(limitSyringePin, INPUT_PULLUP);
  
  pinMode(RELAY_KIPAS_PIN, OUTPUT);
  digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? LOW : HIGH); // Membuat kipas MATI saat pertama colok listrik

  // Inisialisasi I2C dan Sensor BME280
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!bmeAtas.begin(0x76, &Wire)) {
    Serial.println("Gagal menemukan sensor BME280 Atas (0x76)!");
  }
  if (!bmeBawah.begin(0x77, &Wire)) {
    Serial.println("Gagal menemukan sensor BME280 Bawah (0x77)!");
  }

  // Koneksi WiFi
  Serial.print("Menghubungkan ke WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Terhubung! IP: " + WiFi.localIP().toString());

  // Membuat Tugas di Core 0 
  xTaskCreatePinnedToCore(
    taskSensorDanWiFi,   
    "SensorWiFiTask",    
    10000,               
    NULL,                
    1,                   
    &TaskSensorWiFi,     
    0                    
  );

  Serial.println("\nSistem Siap! (Dual-Core Aktif)");
  Serial.println("Perintah: 'U' (Naik), 'D' (Turun), 'S' (Stop)");
  Serial.println("Kipas   : '1' (On), '0' (Off)");
}

// ================= LOOP UTAMA (CORE 1 - MOTOR & SERIAL) =================
void loop() {
  // 1. Membaca perintah dari Serial Monitor 
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    prosesPerintah(cmd);
  }

  // Diagnosa perubahan status limit switch secara real-time
  checkLimitSwitchStatusChanges();

  // 2. Proteksi Real-time
  if (motorState != 0) {
    if (bacaSensorStabil(limitSyringePin, !LIMIT_SYRINGE_ACTIVE_STATE)) {
      motorState = 0;
      Serial.println("EMERGENCY STOP: Syringe terlepas!");
    }
    else if (motorState == 1 && bacaSensorStabil(limitAtasPin, LIMIT_ATAS_ACTIVE_STATE)) {
      motorState = 0;
      Serial.println("ALERT: Limit Atas Tertabrak!");
    }
    else if (motorState == 2 && bacaSensorStabil(limitBawahPin, LIMIT_BAWAH_ACTIVE_STATE)) {
      motorState = 0;
      Serial.println("ALERT: Limit Bawah Tertabrak!");
    }
  }

  // 3. Eksekusi Pulsa Motor
  if (motorState != 0) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(400);  
    digitalWrite(stepPin, LOW);
    delayMicroseconds(400);
  }
}