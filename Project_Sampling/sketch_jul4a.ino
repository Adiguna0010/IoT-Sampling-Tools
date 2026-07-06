#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

// ================= KONFIGURASI WIFI & SERVER =================
const char* ssid = "1234";
const char* password = "12345678";
const char* serverUrl = "http://172.21.27.68:3000/api/data"; 

// ================= KONFIGURASI PIN =================
#define SDA_PIN           21
#define SCL_PIN           22
#define MQ4_1_PIN         34  // Sensor Gas MQ-4 Atas (Analog)
#define MQ4_2_PIN         35  // Sensor Gas MQ-4 Bawah (Analog)
#define RELAY_KIPAS_PIN   25  // Relay Kipas DC

const int dirPin = 26;   // Direction Stepper
const int stepPin = 27;  // Pulse Stepper
const int limitAtasPin = 32;    
const int limitBawahPin = 33;   
const int limitSyringePin = 4;  // Interlock Syringe

// ================= VARIABEL GLOBAL =================
Adafruit_BME280 bmeAtas;  
Adafruit_BME280 bmeBawah; 

String command = "";
int motorState = 0; // 0 = stop, 1 = naik, 2 = turun
int fanState = 0;   // 0 = off, 1 = on

TaskHandle_t TaskSensorWiFi; // Handle untuk Core 0

// ================= FUNGSI ANTI-NOISE LIMIT SWITCH =================
bool bacaSensorStabil(int pin, int targetState) {
  int hitunganBenar = 0;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(pin) == targetState) hitunganBenar++;
    delayMicroseconds(100); 
  }
  return (hitunganBenar >= 4); 
}

// ================= TUGAS CORE 0 (SENSOR & WIFI) =================
// Fungsi ini berjalan secara independen di Core 0 agar tidak mengganggu putaran motor
void taskSensorDanWiFi(void * pvParameters) {
  for(;;) {
    // Jalankan pembacaan setiap 10 detik (10000 ms)
    vTaskDelay(10000 / portTICK_PERIOD_MS);

    // --- PENGAMBILAN SAMPLE 1 ---
    float t1_a = bmeAtas.readTemperature();
    float h1_a = bmeAtas.readHumidity();
    float p1_a = bmeAtas.readPressure() / 100.0F;
    int mq1_a  = analogRead(MQ4_1_PIN);

    float t1_b = bmeBawah.readTemperature();
    float h1_b = bmeBawah.readHumidity();
    float p1_b = bmeBawah.readPressure() / 100.0F;
    int mq1_b  = analogRead(MQ4_2_PIN);

    vTaskDelay(2000 / portTICK_PERIOD_MS); // Jeda 2 detik antar sample

    // --- PENGAMBILAN SAMPLE 2 ---
    float t2_a = bmeAtas.readTemperature();
    float h2_a = bmeAtas.readHumidity();
    float p2_a = bmeAtas.readPressure() / 100.0F;
    int mq2_a  = analogRead(MQ4_1_PIN);

    float t2_b = bmeBawah.readTemperature();
    float h2_b = bmeBawah.readHumidity();
    float p2_b = bmeBawah.readPressure() / 100.0F;
    int mq2_b  = analogRead(MQ4_2_PIN);

    // --- KALKULASI RATA-RATA ---
    float avgSuhu = (t1_a + t1_b + t2_a + t2_b) / 4.0;
    float avgKelembaban = (h1_a + h1_b + h2_a + h2_b) / 4.0;
    float avgTekanan = (p1_a + p1_b + p2_a + p2_b) / 4.0;
    int avgGas = (mq1_a + mq1_b + mq2_a + mq2_b) / 4;
    int isSyringePresent = bacaSensorStabil(limitSyringePin, LOW) ? 1 : 0;

    // --- TAMPILKAN KE SERIAL MONITOR ---
    Serial.println("\n=== HASIL PEMBACAAN SENSOR ===");
    Serial.printf("BME280 Atas  - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", t2_a, h2_a, p2_a);
    Serial.printf("BME280 Bawah - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", t2_b, h2_b, p2_b);
    Serial.printf("MQ-4 Atas    : %d | MQ-4 Bawah : %d\n", mq2_a, mq2_b);
    Serial.println("--- NILAI AVERAGE (DIKIRIM KE SERVER) ---");
    Serial.printf("Suhu: %.2f | Kelembaban: %.2f | Tekanan: %.2f | Gas: %d\n", avgSuhu, avgKelembaban, avgTekanan, avgGas);
    Serial.println("================================\n");

    // --- FORMAT JSON ---
    String jsonPayload = "{";
    jsonPayload += "\"device\": \"Chamber 1\", ";
    jsonPayload += "\"suhu\": " + String(avgSuhu, 2) + ", ";
    jsonPayload += "\"kelembaban\": " + String(avgKelembaban, 2) + ", ";
    jsonPayload += "\"tekanan\": " + String(avgTekanan, 2) + ", ";
    jsonPayload += "\"gas_metana\": " + String(avgGas) + ", ";
    jsonPayload += "\"syringe_present\": " + String(isSyringePresent);
    jsonPayload += "}";

    // --- KIRIM HTTP POST JIKA WIFI TERHUBUNG ---
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");
      int httpResponseCode = http.POST(jsonPayload);
      
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.printf("Data terkirim! HTTP: %d\n", httpResponseCode);
        
        // Membaca perintah dari server (Parsing Sederhana)
        if (response.indexOf("\"command_value\":\"1\"") > 0) prosesPerintah("1");
        if (response.indexOf("\"command_value\":\"0\"") > 0) prosesPerintah("0");
        if (response.indexOf("\"command_value\":\"U\"") > 0) prosesPerintah("U");
        if (response.indexOf("\"command_value\":\"D\"") > 0) prosesPerintah("D");
        if (response.indexOf("\"command_value\":\"S\"") > 0) prosesPerintah("S");
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
  
  bool syringeTerpasang = bacaSensorStabil(limitSyringePin, LOW);

  if (cmd == "1") {
    digitalWrite(RELAY_KIPAS_PIN, HIGH);
    fanState = 1;
    Serial.println("Status: Kipas ON");
  } else if (cmd == "0") {
    digitalWrite(RELAY_KIPAS_PIN, LOW);
    fanState = 0;
    Serial.println("Status: Kipas OFF");
  } else if (!syringeTerpasang && (cmd == "U" || cmd == "D")) {
    Serial.println("PROSES DITOLAK: Syringe belum terpasang!");
  } else if (cmd == "U") {
    if (!bacaSensorStabil(limitAtasPin, LOW)) { 
      motorState = 1;
      digitalWrite(dirPin, HIGH);
      Serial.println("Status: Motor NAIK (Up)");
    }
  } else if (cmd == "D") {
    if (!bacaSensorStabil(limitBawahPin, LOW)) { 
      motorState = 2;
      digitalWrite(dirPin, LOW);
      Serial.println("Status: Motor TURUN (Down)");
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
  digitalWrite(RELAY_KIPAS_PIN, LOW); // Pastikan kipas mati saat awal hidup

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

  // Membuat Tugas di Core 0 (Sensor & WiFi berjalan di background)
  xTaskCreatePinnedToCore(
    taskSensorDanWiFi,   // Fungsi yang dipanggil
    "SensorWiFiTask",    // Nama Task
    10000,               // Ukuran Stack (Bytes)
    NULL,                // Parameter
    1,                   // Prioritas (1 = standar)
    &TaskSensorWiFi,     // Handle Task
    0                    // Core 0
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

  // 2. Proteksi Real-time
  if (motorState != 0) {
    if (bacaSensorStabil(limitSyringePin, HIGH)) {
      motorState = 0;
      Serial.println("EMERGENCY STOP: Syringe terlepas!");
    }
    else if (motorState == 1 && bacaSensorStabil(limitAtasPin, LOW)) {
      motorState = 0;
      Serial.println("ALERT: Limit Atas Tertabrak!");
    }
    else if (motorState == 2 && bacaSensorStabil(limitBawahPin, LOW)) {
      motorState = 0;
      Serial.println("ALERT: Limit Bawah Tertabrak!");
    }
  }

  // 3. Eksekusi Pulsa Motor (Sangat Lancar karena di Core 1)
  if (motorState != 0) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(400);  
    digitalWrite(stepPin, LOW);
    delayMicroseconds(400);
  }
}