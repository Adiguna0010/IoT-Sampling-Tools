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
const int LIMIT_ATAS_ACTIVE_STATE = LOW;    
const int LIMIT_BAWAH_ACTIVE_STATE = LOW;
const int LIMIT_SYRINGE_ACTIVE_STATE = LOW;
const bool KIPAS_ACTIVE_HIGH = false;        

int lastAtasState = -1;
int lastBawahState = -1;
int lastSyringeState = -1;

int pulseDelayUs = 150; // Kecepatan Stepper Cepat & Super Halus (150 us)

// Helper presisi: Mengambil HANYA 1 PERINTAH TERAKHIR dari respon Vercel (Mencegah Motor Kagok/Kebingungan)
String getLatestCommandValue(String resp) {
  int idx = resp.lastIndexOf("\"command_value\"");
  if (idx == -1) return "";
  int valStart = resp.indexOf(":", idx);
  if (valStart == -1) return "";
  int quote1 = resp.indexOf("\"", valStart);
  if (quote1 == -1) return "";
  int quote2 = resp.indexOf("\"", quote1 + 1);
  if (quote2 == -1) return "";
  return resp.substring(quote1 + 1, quote2);
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
int motorState = 0; // 0 = STOP, 1 = NAIK, 2 = TURUN
int fanState = 0;   // 0 = OFF, 1 = ON

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

int hitungPPM(int nilaiAnalog) {
  return map(nilaiAnalog, 0, 4095, 0, 10000); 
}

// ================= TUGAS CORE 0 (PERSISTENT SSL CLIENT & EKSEKUSI PERINTAH TUNGGAL) =================
void taskSensorDanWiFi(void * pvParameters) {
  WiFiClientSecure client;
  client.setInsecure(); 
  HTTPClient http;
  http.setReuse(true);  

  unsigned long lastPostTime = 0;
  const unsigned long postInterval = 2000; // 2.0 detik

  for(;;) {
    unsigned long currentMillis = millis();

    if (currentMillis - lastPostTime >= postInterval) {
      lastPostTime = currentMillis;

      float t_a = bmeAtas.readTemperature();
      float h_a = bmeAtas.readHumidity();
      float p_a = bmeAtas.readPressure() / 100.0F;
      int mq_1 = hitungPPM(analogRead(MQ4_1_PIN));
      int mq_2 = hitungPPM(analogRead(MQ4_2_PIN));
      int mq_3 = hitungPPM(analogRead(MQ4_3_PIN));

      float t_b = bmeBawah.readTemperature();
      float h_b = bmeBawah.readHumidity();
      float p_b = bmeBawah.readPressure() / 100.0F;

      if (isnan(t_a)) t_a = 0.0;
      if (isnan(h_a)) h_a = 0.0;
      if (isnan(p_a)) p_a = 0.0;
      if (isnan(t_b)) t_b = 0.0;
      if (isnan(h_b)) h_b = 0.0;
      if (isnan(p_b)) p_b = 0.0;

      float avgSuhu = (t_a + t_b) / 2.0;
      float avgKelembaban = (h_a + h_b) / 2.0;
      float avgTekanan = (p_a + p_b) / 2.0;
      int avgGasPPM = (mq_1 + mq_2 + mq_3) / 3;

      int isSyringePresent = bacaSensorStabil(limitSyringePin, LIMIT_SYRINGE_ACTIVE_STATE) ? 1 : 0;
      int isLimitAtas = bacaSensorStabil(limitAtasPin, LIMIT_ATAS_ACTIVE_STATE) ? 1 : 0;
      int isLimitBawah = bacaSensorStabil(limitBawahPin, LIMIT_BAWAH_ACTIVE_STATE) ? 1 : 0;

      Serial.println("\n================ HASIL PEMBACAAN SENSOR ================");
      Serial.printf("BME280 Atas  - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", t_a, h_a, p_a);
      Serial.printf("BME280 Bawah - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", t_b, h_b, p_b);
      Serial.printf("MQ-4 Gas     - Sensor 1: %d PPM | Sensor 2: %d PPM | Sensor 3: %d PPM\n", mq_1, mq_2, mq_3);
      Serial.println("---------------- RATA-RATA (DIKIRIM KE VERCEL) ----------------");
      Serial.printf("Suhu Rata-rata: %.2f C | Kelembaban: %.2f %% | Gas Metana: %d PPM\n", avgSuhu, avgKelembaban, avgGasPPM);
      Serial.println("---------------- STATUS SAKLAR LIMIT SWITCH & KIPAS ------------");
      Serial.printf("Limit Atas (LS1)    : %s (RAW: %d)\n", isLimitAtas ? "TERTEKAN (AKTIF)" : "TERLEPAS", digitalRead(limitAtasPin));
      Serial.printf("Limit Bawah (LS2)   : %s (RAW: %d)\n", isLimitBawah ? "TERTEKAN (AKTIF)" : "TERLEPAS", digitalRead(limitBawahPin));
      Serial.printf("Limit Syringe (LS3) : %s (RAW: %d)\n", isSyringePresent ? "TERTEKAN (AKTIF)" : "TERLEPAS", digitalRead(limitSyringePin));
      Serial.printf("Status Kipas (Relay): %s\n", fanState == 1 ? "ON (1)" : "OFF (0)");
      Serial.println("==============================================================\n");

      // FORMAT JSON LENGKAP TERMASUK kipas_state UNTUK AUTO-SYNC WEBSITE
      String jsonPayload = "{";
      jsonPayload += "\"device\": \"Chamber 1\", ";
      jsonPayload += "\"suhu\": " + String(avgSuhu, 2) + ", ";
      jsonPayload += "\"kelembaban\": " + String(avgKelembaban, 2) + ", ";
      jsonPayload += "\"tekanan\": " + String(avgTekanan, 2) + ", ";
      jsonPayload += "\"gas_metana\": " + String(avgGasPPM) + ", "; 
      jsonPayload += "\"syringe_present\": " + String(isSyringePresent) + ", ";
      jsonPayload += "\"limit_atas\": " + String(isLimitAtas) + ", ";
      jsonPayload += "\"limit_bawah\": " + String(isLimitBawah) + ", ";
      jsonPayload += "\"kipas_state\": " + String(fanState);
      jsonPayload += "}";

      if (WiFi.status() == WL_CONNECTED) {
        http.begin(client, serverUrl);
        http.addHeader("Content-Type", "application/json");
        http.setTimeout(2000); 
        int httpResponseCode = http.POST(jsonPayload);
        
        if (httpResponseCode > 0) {
          String response = http.getString();
          Serial.printf("[HTTP SERVER] Data terkirim! Respon HTTP: %d\n", httpResponseCode);
          
          String latestCmd = getLatestCommandValue(response);
          if (latestCmd != "") {
            Serial.println("[COMMAND] Perintah Tunggal Terbaru Diterima: " + latestCmd);
            prosesPerintah(latestCmd);
          }
        } else {
          Serial.printf("[HTTP NOTICE] Vercel Server sibuk (Code: %d), mencoba ulang...\n", httpResponseCode);
        }
        http.end();
      } else {
        Serial.println("[WIFI ALERT] WiFi Terputus! Reconnecting...");
        WiFi.reconnect();
      }
    }

    vTaskDelay(50 / portTICK_PERIOD_MS);
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
    Serial.println("STATUS BARU: Kipas ON");
  } else if (cmd == "0") {
    digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? LOW : HIGH);
    fanState = 0;
    Serial.println("STATUS BARU: Kipas OFF");
  } else if (!syringeTerpasang && (cmd == "U" || cmd == "D")) {
    Serial.println("PROSES DITOLAK: Syringe belum terpasang (LS3 Terlepas)!");
  } else if (cmd == "U") {
    if (!bacaSensorStabil(limitAtasPin, LIMIT_ATAS_ACTIVE_STATE)) { 
      digitalWrite(dirPin, HIGH);
      
      for (int d = 600; d > pulseDelayUs; d -= 25) {
        digitalWrite(stepPin, HIGH);
        delayMicroseconds(d);
        digitalWrite(stepPin, LOW);
        delayMicroseconds(d);
      }
      
      motorState = 1;
      Serial.println("STATUS BARU: Motor NAIK (Up)");
    } else {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("GERAK NAIK DITOLAK: Limit Atas terdeteksi!");
    }
  } else if (cmd == "D") {
    if (!bacaSensorStabil(limitBawahPin, LIMIT_BAWAH_ACTIVE_STATE)) { 
      digitalWrite(dirPin, LOW);

      for (int d = 600; d > pulseDelayUs; d -= 25) {
        digitalWrite(stepPin, HIGH);
        delayMicroseconds(d);
        digitalWrite(stepPin, LOW);
        delayMicroseconds(d);
      }

      motorState = 2;
      Serial.println("STATUS BARU: Motor TURUN (Down)");
    } else {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("GERAK TURUN DITOLAK: Limit Bawah terdeteksi!");
    }
  } else if (cmd == "S" || cmd == "STOP") {
    motorState = 0;
    digitalWrite(stepPin, LOW);
    Serial.println("STATUS BARU: Motor BERHENTI");
  }
}

// ================= SETUP UTAMA =================
void setup() {
  Serial.begin(9600);
  delay(1000);
  
  Serial.println("\n=================================================");
  Serial.println("   SMART CHAMBER IOT - SYSTEM INITIALIZING (9600)");
  Serial.println("=================================================");
  
  pinMode(dirPin, OUTPUT);
  pinMode(stepPin, OUTPUT);
  pinMode(limitAtasPin, INPUT_PULLUP);
  pinMode(limitBawahPin, INPUT_PULLUP);
  pinMode(limitSyringePin, INPUT_PULLUP);
  
  digitalWrite(stepPin, LOW);
  digitalWrite(dirPin, LOW);

  pinMode(RELAY_KIPAS_PIN, OUTPUT);
  digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? LOW : HIGH); 

  Wire.begin(SDA_PIN, SCL_PIN);
  if (!bmeAtas.begin(0x76, &Wire)) {
    Serial.println("❌ Gagal menemukan sensor BME280 Atas (0x76)!");
  } else {
    Serial.println("✅ Sensor BME280 Atas (0x76) Terhubung!");
  }
  
  if (!bmeBawah.begin(0x77, &Wire)) {
    Serial.println("❌ Gagal menemukan sensor BME280 Bawah (0x77)!");
  } else {
    Serial.println("✅ Sensor BME280 Bawah (0x77) Terhubung!");
  }

  Serial.print("Menghubungkan ke WiFi SSID: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 20) {
    delay(500);
    Serial.print(".");
    wifiTimeout++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Terhubung! IP ESP32: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n⚠️ WiFi Tidak Terhubung! Sistem akan tetap menjalankan kontrol manual.");
  }

  xTaskCreatePinnedToCore(
    taskSensorDanWiFi,   
    "SensorWiFiTask",    
    10000,               
    NULL,                
    1,                   
    &TaskSensorWiFi,     
    0                    
  );

  Serial.println("\n=================================================");
  Serial.println(" SISTEM SIAP! (Perintah Serial: U, D, S, 1, 0)");
  Serial.println("=================================================\n");
}

// ================= LOOP UTAMA (CORE 1 - MOTOR & SERIAL) =================
void loop() {
  // 1. Membaca perintah dari Serial Monitor 
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    prosesPerintah(cmd);
  }

  // 2. Proteksi & Eksekusi Pulsa Motor Stepper Presisi Murni
  if (motorState == 1) {
    if (bacaSensorStabil(limitSyringePin, !LIMIT_SYRINGE_ACTIVE_STATE)) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("EMERGENCY STOP: Syringe terlepas!");
      return;
    }
    if (bacaSensorStabil(limitAtasPin, LIMIT_ATAS_ACTIVE_STATE)) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("ALERT: Limit Atas Tertabrak!");
      return;
    }
    
    for (int i = 0; i < 200; i++) {
      digitalWrite(stepPin, HIGH);
      delayMicroseconds(pulseDelayUs);
      digitalWrite(stepPin, LOW);
      delayMicroseconds(pulseDelayUs);
    }
  }
  else if (motorState == 2) {
    if (bacaSensorStabil(limitSyringePin, !LIMIT_SYRINGE_ACTIVE_STATE)) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("EMERGENCY STOP: Syringe terlepas!");
      return;
    }
    if (bacaSensorStabil(limitBawahPin, LIMIT_BAWAH_ACTIVE_STATE)) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("ALERT: Limit Bawah Tertabrak!");
      return;
    }

    for (int i = 0; i < 200; i++) {
      digitalWrite(stepPin, HIGH);
      delayMicroseconds(pulseDelayUs);
      digitalWrite(stepPin, LOW);
      delayMicroseconds(pulseDelayUs);
    }
  }
  else {
    digitalWrite(stepPin, LOW);
  }
}