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

int motorState = 0; // 0 = STOP, 1 = NAIK, 2 = TURUN
int fanState = 0;   // 0 = OFF, 1 = ON
int pulseDelayUs = 150; // 150 us (Identik persis TEST_STEPPER_ONLY.ino)

Adafruit_BME280 bmeAtas;  
Adafruit_BME280 bmeBawah; 

WiFiClientSecure client;
HTTPClient http;

unsigned long lastPostTime = 0;
const unsigned long postInterval = 1500; // 1.5 detik

// Declarations
void eksekusiMotorNaik();
void eksekusiMotorTurun();
void prosesPerintah(String cmd);
void bacaDanKirimDataSensor();

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

int hitungPPM(int nilaiAnalog) {
  return map(nilaiAnalog, 0, 4095, 0, 10000); 
}

// ================= EKSEKUSI MOTOR NAIK (100% IDENTIK PERSIS TEST_STEPPER_ONLY.INO) =================
void eksekusiMotorNaik() {
  if (digitalRead(limitSyringePin) != LIMIT_SYRINGE_ACTIVE_STATE) {
    motorState = 0;
    digitalWrite(stepPin, LOW);
    Serial.println("[WARNING] NAIK Ditolak: Syringe Terlepas (LS3)!");
    return;
  }
  if (digitalRead(limitAtasPin) == LIMIT_ATAS_ACTIVE_STATE) {
    motorState = 0;
    digitalWrite(stepPin, LOW);
    Serial.println("[WARNING] NAIK Ditolak: Limit Atas (LS1) TERTEKAN!");
    return;
  }

  digitalWrite(dirPin, HIGH);
  delayMicroseconds(50);

  Serial.printf("[STATUS] Motor NAIK Dipicu | Delay: %d us\n", pulseDelayUs);

  // Soft-start murni persis TEST_STEPPER_ONLY (800us -> target 150us)
  for (int d = 800; d > pulseDelayUs; d -= 20) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(d);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(d);
  }

  while (motorState == 1) {
    if (digitalRead(limitAtasPin) == LIMIT_ATAS_ACTIVE_STATE) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("\n[ALERT] MOTOR BERHENTI! Limit Atas (LS1) Tertabrak!");
      break;
    }
    if (digitalRead(limitSyringePin) != LIMIT_SYRINGE_ACTIVE_STATE) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("\n[EMERGENCY STOP] Syringe Terlepas (LS3)!");
      break;
    }

    // Blok 200 Pulsa Presisi Murni Tanpa Interupsi Core (Persis TEST_STEPPER_ONLY)
    for (int i = 0; i < 200; i++) {
      digitalWrite(stepPin, HIGH);
      delayMicroseconds(pulseDelayUs);
      digitalWrite(stepPin, LOW);
      delayMicroseconds(pulseDelayUs);
    }

    // Cek Serial Monitor secara cepat untuk perintah STOP instan
    if (Serial.available() > 0) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      cmd.toUpperCase();
      if (cmd == "S" || cmd == "STOP" || cmd == "D" || cmd == "0") {
        motorState = 0;
        digitalWrite(stepPin, LOW);
        Serial.println("[STATUS] Motor BERHENTI (STOP)");
        break;
      }
    }
  }
  digitalWrite(stepPin, LOW);
}

// ================= EKSEKUSI MOTOR TURUN (100% IDENTIK PERSIS TEST_STEPPER_ONLY.INO) =================
void eksekusiMotorTurun() {
  if (digitalRead(limitSyringePin) != LIMIT_SYRINGE_ACTIVE_STATE) {
    motorState = 0;
    digitalWrite(stepPin, LOW);
    Serial.println("[WARNING] TURUN Ditolak: Syringe Terlepas (LS3)!");
    return;
  }
  if (digitalRead(limitBawahPin) == LIMIT_BAWAH_ACTIVE_STATE) {
    motorState = 0;
    digitalWrite(stepPin, LOW);
    Serial.println("[WARNING] TURUN Ditolak: Limit Bawah (LS2) TERTEKAN!");
    return;
  }

  digitalWrite(dirPin, LOW);
  delayMicroseconds(50);

  Serial.printf("[STATUS] Motor TURUN Dipicu | Delay: %d us\n", pulseDelayUs);

  // Soft-start murni persis TEST_STEPPER_ONLY (800us -> target 150us)
  for (int d = 800; d > pulseDelayUs; d -= 20) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(d);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(d);
  }

  while (motorState == 2) {
    if (digitalRead(limitBawahPin) == LIMIT_BAWAH_ACTIVE_STATE) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("\n[ALERT] MOTOR BERHENTI! Limit Bawah (LS2) Tertabrak!");
      break;
    }
    if (digitalRead(limitSyringePin) != LIMIT_SYRINGE_ACTIVE_STATE) {
      motorState = 0;
      digitalWrite(stepPin, LOW);
      Serial.println("\n[EMERGENCY STOP] Syringe Terlepas (LS3)!");
      break;
    }

    // Blok 200 Pulsa Presisi Murni Tanpa Interupsi Core (Persis TEST_STEPPER_ONLY)
    for (int i = 0; i < 200; i++) {
      digitalWrite(stepPin, HIGH);
      delayMicroseconds(pulseDelayUs);
      digitalWrite(stepPin, LOW);
      delayMicroseconds(pulseDelayUs);
    }

    // Cek Serial Monitor secara cepat untuk perintah STOP instan
    if (Serial.available() > 0) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      cmd.toUpperCase();
      if (cmd == "S" || cmd == "STOP" || cmd == "U" || cmd == "0") {
        motorState = 0;
        digitalWrite(stepPin, LOW);
        Serial.println("[STATUS] Motor BERHENTI (STOP)");
        break;
      }
    }
  }
  digitalWrite(stepPin, LOW);
}

// ================= FUNGSI PROSES PERINTAH =================
void prosesPerintah(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  
  if (cmd == "1") {
    digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? HIGH : LOW);
    fanState = 1;
    Serial.println("[STATUS] Kipas ON");
  } else if (cmd == "0") {
    digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? LOW : HIGH);
    fanState = 0;
    Serial.println("[STATUS] Kipas OFF");
  } else if (cmd == "U") {
    motorState = 1;
  } else if (cmd == "D") {
    motorState = 2;
  } else if (cmd == "S" || cmd == "STOP") {
    motorState = 0;
    digitalWrite(stepPin, LOW);
    Serial.println("[STATUS] Motor BERHENTI (STOP)");
  }
}

// ================= PEMBACAAN SENSOR & KOMUNIKASI HTTP VERCEL (STANDBY ONLY) =================
void bacaDanKirimDataSensor() {
  float t_a = bmeAtas.readTemperature();
  float h_a = bmeAtas.readHumidity();
  float p_a = bmeAtas.readPressure() / 100.0F;
  
  float t_b = bmeBawah.readTemperature();
  float h_b = bmeBawah.readHumidity();
  float p_b = bmeBawah.readPressure() / 100.0F;

  int mq_1 = hitungPPM(analogRead(MQ4_1_PIN));
  int mq_2 = hitungPPM(analogRead(MQ4_2_PIN));
  int mq_3 = hitungPPM(analogRead(MQ4_3_PIN));

  float avgSuhu = 0, avgKelembaban = 0, avgTekanan = 0;
  int validCount = 0;

  if (!isnan(t_a) && t_a != 0) { avgSuhu += t_a; avgKelembaban += h_a; avgTekanan += p_a; validCount++; }
  if (!isnan(t_b) && t_b != 0) { avgSuhu += t_b; avgKelembaban += h_b; avgTekanan += p_b; validCount++; }

  if (validCount > 0) {
    avgSuhu /= validCount;
    avgKelembaban /= validCount;
    avgTekanan /= validCount;
  } else {
    avgSuhu = 28.50;
    avgKelembaban = 75.00;
    avgTekanan = 1013.25;
  }

  int avgGasPPM = (mq_1 + mq_2 + mq_3) / 3;

  int isSyringePresent = (digitalRead(limitSyringePin) == LIMIT_SYRINGE_ACTIVE_STATE) ? 1 : 0;
  int isLimitAtas = (digitalRead(limitAtasPin) == LIMIT_ATAS_ACTIVE_STATE) ? 1 : 0;
  int isLimitBawah = (digitalRead(limitBawahPin) == LIMIT_BAWAH_ACTIVE_STATE) ? 1 : 0;

  Serial.println("\n================ HASIL PEMBACAAN SENSOR ================");
  Serial.printf("BME280 Atas  - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", isnan(t_a)?0:t_a, isnan(h_a)?0:h_a, isnan(p_a)?0:p_a);
  Serial.printf("BME280 Bawah - Suhu: %.2f C | Kelembaban: %.2f %% | Tekanan: %.2f hPa\n", isnan(t_b)?0:t_b, isnan(h_b)?0:h_b, isnan(p_b)?0:p_b);
  Serial.printf("MQ-4 Gas     - Sensor 1: %d PPM | Sensor 2: %d PPM | Sensor 3: %d PPM\n", mq_1, mq_2, mq_3);
  Serial.println("---------------- RATA-RATA (DIKIRIM KE VERCEL) ----------------");
  Serial.printf("Suhu Rata-rata: %.2f C | Kelembaban: %.2f %% | Gas Metana: %d PPM\n", avgSuhu, avgKelembaban, avgGasPPM);
  Serial.println("---------------- STATUS SAKLAR LIMIT SWITCH & KIPAS ------------");
  Serial.printf("Limit Atas (LS1)    : %s (RAW: %d)\n", isLimitAtas ? "TERTEKAN (AKTIF)" : "TERLEPAS", digitalRead(limitAtasPin));
  Serial.printf("Limit Bawah (LS2)   : %s (RAW: %d)\n", isLimitBawah ? "TERTEKAN (AKTIF)" : "TERLEPAS", digitalRead(limitBawahPin));
  Serial.printf("Limit Syringe (LS3) : %s (RAW: %d)\n", isSyringePresent ? "TERTEKAN (AKTIF)" : "TERLEPAS", digitalRead(limitSyringePin));
  Serial.printf("Status Kipas (Relay): %s | Status Motor: %s\n", fanState == 1 ? "ON (1)" : "OFF (0)", motorState == 1 ? "NAIK" : (motorState == 2 ? "TURUN" : "STOP"));
  Serial.println("==============================================================\n");

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
    http.setTimeout(1500); 
    int httpResponseCode = http.POST(jsonPayload);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.printf("[HTTP SERVER] Data terkirim! Respon HTTP: %d\n", httpResponseCode);
      String latestCmd = getLatestCommandValue(response);
      if (latestCmd != "") {
        Serial.println("[COMMAND] Perintah Terbaru dari Web Vercel: " + latestCmd);
        prosesPerintah(latestCmd);
      }
    }
    http.end();
  } else {
    WiFi.reconnect();
  }
}

// ================= SETUP UTAMA =================
void setup() {
  Serial.begin(9600);
  delay(1000);
  
  Serial.println("\n=================================================");
  Serial.println(" SMART CHAMBER IOT - SYSTEM INITIALIZING (9600)");
  Serial.println("=================================================");
  
  pinMode(stepPin, OUTPUT);
  pinMode(dirPin, OUTPUT);
  
  digitalWrite(stepPin, LOW);
  digitalWrite(dirPin, LOW);

  pinMode(limitAtasPin, INPUT_PULLUP);
  pinMode(limitBawahPin, INPUT_PULLUP);
  pinMode(limitSyringePin, INPUT_PULLUP);

  pinMode(RELAY_KIPAS_PIN, OUTPUT);
  digitalWrite(RELAY_KIPAS_PIN, KIPAS_ACTIVE_HIGH ? LOW : HIGH); 

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000); // 100 kHz I2C Standard Speed
  delay(100);

  if (!bmeAtas.begin(0x76, &Wire)) {
    bmeAtas.begin(0x77, &Wire);
  }
  
  if (!bmeBawah.begin(0x77, &Wire)) {
    bmeBawah.begin(0x76, &Wire);
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
    Serial.println("\n⚠️ WiFi Tidak Terhubung! Kontrol manual tetap aktif.");
  }

  client.setInsecure();
  http.setReuse(true);

  Serial.println("\n=================================================");
  Serial.println(" SISTEM SIAP! (Perintah Serial: U, D, S, 1, 0)");
  Serial.println("=================================================\n");
}

// ================= LOOP UTAMA (STRUKTUR SIKLUS MURNI PERSIS TEST_STEPPER_ONLY.INO) =================
void loop() {
  // 1. Membaca perintah dari Serial Monitor
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    prosesPerintah(cmd);
  }

  // 2. Eksekusi Pergerakan Motor Stepper (Jika dipemicu NAIK/TURUN)
  if (motorState == 1) {
    eksekusiMotorNaik();
  } else if (motorState == 2) {
    eksekusiMotorTurun();
  } else {
    digitalWrite(stepPin, LOW);
  }

  // 3. Pembacaan Sensor & Komunikasi HTTP Vercel HANYA SAAT MOTOR STOP (STANDBY)
  if (motorState == 0) {
    unsigned long currentMillis = millis();
    if (currentMillis - lastPostTime >= postInterval) {
      lastPostTime = currentMillis;
      bacaDanKirimDataSensor();
    }
  }
}