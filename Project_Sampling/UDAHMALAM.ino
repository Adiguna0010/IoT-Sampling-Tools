#include <Wire.h>
#include <Adafruit_BME280.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FastAccelStepper.h> 

// ===================== KONFIGURASI WiFi & SERVER =====================
const char* WIFI_SSID     = "1234";
const char* WIFI_PASSWORD = "12345678";
const char* SERVER_URL    = "http://10.213.24.68:3000/api/data";

// ===================== KONFIGURASI PIN =====================
#define SDA_PIN           21
#define SCL_PIN           22
#define MQ4_1_PIN         34
#define MQ4_2_PIN         35
#define DIR_PIN           26
#define STEP_PIN          27
#define LIMIT_ATAS_PIN    32
#define LIMIT_BAWAH_PIN   33
#define SYRINGE_PIN       4   
#define RELAY_PIN         14  

// ===================== KONFIGURASI TIMING =====================
#define JUMLAH_SAMPLE   5
#define DELAY_SAMPLE    10    
const unsigned long INTERVAL_KIRIM = 5000;
unsigned long waktuSebelumnya = 0;

// ===================== OBJEK SENSOR & STEPPER =====================
Adafruit_BME280 bme1; 
Adafruit_BME280 bme2; 

bool bme1Status = false;
bool bme2Status = false;

FastAccelStepperEngine engine;
FastAccelStepper *stepperMotor = NULL;

// ===================================================================
//  SETUP
// ===================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);
  
  initSensor();
  initWiFi();

  pinMode(LIMIT_ATAS_PIN, INPUT_PULLUP);
  pinMode(LIMIT_BAWAH_PIN, INPUT_PULLUP);
  pinMode(SYRINGE_PIN, INPUT_PULLUP);
  
  // Set explicit output untuk pin DIR guna mengatasi optocoupler delay
  pinMode(DIR_PIN, OUTPUT); 

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  
  engine.init();
  stepperMotor = engine.stepperConnectToPin(STEP_PIN);
  if (stepperMotor) {
    stepperMotor->setDirectionPin(DIR_PIN);
    stepperMotor->setAutoEnable(false);
    
    // Kecepatan 850 Hz
    stepperMotor->setSpeedInHz(850);      
    stepperMotor->setAcceleration(2000);
  }

  Serial.println("--- DAFTAR PERINTAH SERIAL MONITOR ---");
  Serial.println("'U'        : Stepper gerak NAIK");
  Serial.println("'D'        : Stepper gerak TURUN");
  Serial.println("'1'        : Nyalakan Kipas (Relay ON)");
  Serial.println("'0'        : Matikan Kipas (Relay OFF)");
  Serial.println("--------------------------------------");
}

// ===================================================================
//  FUNGSI: Kontrol Stepper Up / Down (UPDATED)
// ===================================================================
void gerakStepper(bool arahNaik, int jumlahLangkah) {
  if (digitalRead(SYRINGE_PIN) == LOW) {
    Serial.println("[ALARM] Syringe tidak terdeteksi! Fitur Up/Down dinonaktifkan.");
    return;
  }

  // --- TAMBAHAN: BERHENTI PAKSA & RESET BUFFER ---
  stepperMotor->forceStopAndNewPosition(0); 
  delay(50); // Jeda kecil untuk memastikan motor benar-benar diam

  Serial.printf("[STEPPER] Motor bergerak %s...\n", arahNaik ? "NAIK" : "TURUN");
  
  digitalWrite(DIR_PIN, arahNaik ? HIGH : LOW);
  delay(10); 
  
  if (arahNaik) {
    stepperMotor->move(jumlahLangkah);
  } else {
    stepperMotor->move(-jumlahLangkah); 
  }

  while (stepperMotor->isRunning()) {
    if (arahNaik && digitalRead(LIMIT_ATAS_PIN) == LOW) {
      Serial.println("[INFO] Limit Atas tercapai. Motor Berhenti.");
      stepperMotor->forceStopAndNewPosition(0);
      break;
    }
    
    if (!arahNaik && digitalRead(LIMIT_BAWAH_PIN) == LOW) {
      Serial.println("[INFO] Limit Bawah tercapai. Motor Berhenti.");
      stepperMotor->forceStopAndNewPosition(0);
      break;
    }
    delay(1); 
  }
  Serial.println("[STEPPER] Pergerakan selesai.");
}

// ===================================================================
//  LOOP UTAMA
// ===================================================================
void loop() {
  // 1. KONTROL SERIAL (Berjalan setiap saat)
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    if (cmd == 'U' || cmd == 'u') {
      gerakStepper(true, 3750);
    } 
    else if (cmd == 'D' || cmd == 'd') {
      gerakStepper(false, 3750);
    }
    else if (cmd == '1') {
      digitalWrite(RELAY_PIN, HIGH);
      Serial.println("[KIPAS] Dinyalakan secara manual.");
    }
    else if (cmd == '0') {
      digitalWrite(RELAY_PIN, LOW);
      Serial.println("[KIPAS] Dimatikan secara manual.");
    }
  }

  // 2. BACA SENSOR & KIRIM DATA (Setiap 5 detik)
  unsigned long waktuSekarang = millis();
  if (waktuSekarang - waktuSebelumnya >= INTERVAL_KIRIM) {
    waktuSebelumnya = waktuSekarang;
    
    float suhu1 = 0, hum1 = 0, tek1 = 0;
    float suhu2 = 0, hum2 = 0, tek2 = 0;
    int   adc1  = 0, adc2 = 0;
    bool  bme1Ok = false, bme2Ok = false;
    
    if (bme1Status) bme1Ok = bacaBME(bme1, "BME280 ATAS ", suhu1, hum1, tek1);
    else            initSensor();
    
    if (bme2Status) bme2Ok = bacaBME(bme2, "BME280 BAWAH", suhu2, hum2, tek2);
    else            initSensor();

    adc1 = bacaMQ4(MQ4_1_PIN, "MQ-4 ATAS  ");
    adc2 = bacaMQ4(MQ4_2_PIN, "MQ-4 BAWAH ");

    float suhuAvg = 0, humAvg = 0, tekAvg = 0;
    int   bmeValid = 0;
    
    if (bme1Ok) { suhuAvg += suhu1; humAvg += hum1; tekAvg += tek1; bmeValid++; }
    if (bme2Ok) { suhuAvg += suhu2; humAvg += hum2; tekAvg += tek2; bmeValid++; }
    
    if (bmeValid > 0) { 
      suhuAvg /= bmeValid;
      humAvg /= bmeValid; tekAvg /= bmeValid; 
    }

    float adcAvg = 0;
    int   mqValid = 0;
    if (adc1 >= 0) { adcAvg += adc1; mqValid++; }
    if (adc2 >= 0) { adcAvg += adc2; mqValid++; }
    
    if (mqValid > 0) adcAvg /= mqValid;
    
    float ppmAvg = 200.0 + (adcAvg / 4095.0) * 9800.0;
    float ppm1   = 200.0 + (adc1  / 4095.0) * 9800.0;
    float ppm2   = 200.0 + (adc2  / 4095.0) * 9800.0;

    bool statusKipas = (digitalRead(RELAY_PIN) == HIGH);
    
    Serial.printf("[ATAS]  Suhu: %.2f C | Kelembapan: %.2f %% | Tekanan: %.2f hPa | Gas: %.0f ppm\n", suhu1, hum1, tek1, ppm1);
    Serial.printf("[BAWAH] Suhu: %.2f C | Kelembapan: %.2f %% | Tekanan: %.2f hPa | Gas: %.0f ppm\n", suhu2, hum2, tek2, ppm2);
    Serial.printf("[AVG]   Suhu: %.2f C | Kelembapan: %.2f %% | Tekanan: %.2f hPa | Gas: %.0f ppm\n", suhuAvg, humAvg, tekAvg, ppmAvg);
    Serial.printf("[KIPAS] Status: %s\n", statusKipas ? "ON" : "OFF");

    if (WiFi.status() == WL_CONNECTED) {
      kirimData(suhuAvg, humAvg, tekAvg, (bmeValid > 0), ppmAvg, (mqValid > 0), statusKipas);
      Serial.println(); 
    } else {
      Serial.println("[WiFi] Terputus, reconnect...\n");
      initWiFi();
    }
  }
}

// ===================================================================
//  FUNGSI: Inisialisasi Sensor
// ===================================================================
void initSensor() {
  if (!bme1Status) {
    bme1Status = bme1.begin(0x76, &Wire);
    Serial.printf("[BME280 ATAS ] %s\n", bme1Status ? "OK" : "GAGAL - cek SDO ke GND");
  }
  if (!bme2Status) {
    bme2Status = bme2.begin(0x77, &Wire);
    Serial.printf("[BME280 BAWAH] %s\n", bme2Status ? "OK" : "GAGAL - cek SDO ke 3.3V");
  }
}

// ===================================================================
//  FUNGSI: Inisialisasi WiFi
// ===================================================================
void initWiFi() {
  Serial.printf("[WiFi] Connecting to '%s'", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int coba = 0;
  while (WiFi.status() != WL_CONNECTED && coba < 20) {
    delay(500);
    Serial.print(".");
    coba++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] OK - IP: %s | RSSI: %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("[WiFi] GAGAL");
  }
}

// ===================================================================
//  FUNGSI: Baca BME280
// ===================================================================
bool bacaBME(Adafruit_BME280 &bme, const char* label, float &suhu, float &hum, float &tek) {
  float tS = 0, tH = 0, tT = 0;
  int ok = 0;

  for (int i = 0; i < JUMLAH_SAMPLE; i++) {
    float s = bme.readTemperature();
    float h = bme.readHumidity();
    float p = bme.readPressure() / 100.0F;
    
    if (!isnan(s) && !isnan(h) && !isnan(p)) {
      tS += s; tH += h;
      tT += p; ok++;
    }
    delay(DELAY_SAMPLE);
  }

  if (ok == 0) {
    Serial.printf("[%s] GAGAL baca!\n", label);
    if (strcmp(label, "BME280 ATAS ") == 0) bme1Status = false;
    else                                     bme2Status = false;
    return false;
  }

  suhu = tS / ok;
  hum  = tH / ok;
  tek  = tT / ok;
  return true;
}

// ===================================================================
//  FUNGSI: Baca MQ-4
// ===================================================================
int bacaMQ4(int pin, const char* label) {
  long total = 0;
  int  ok    = 0;

  for (int i = 0; i < JUMLAH_SAMPLE; i++) {
    int adc = analogRead(pin);
    if (adc >= 0 && adc <= 4095) { total += adc; ok++; }
    delay(DELAY_SAMPLE);
  }

  if (ok == 0) {
    Serial.printf("[%s] GAGAL baca!\n", label);
    return -1;
  }
  return total / ok;
}

// ===================================================================
//  FUNGSI: Kirim Data & Ambil Instruksi Server via HTTP POST
// ===================================================================
void kirimData(float suhu, float hum, float tek, bool bmeOk, float ppmAvg, bool mqOk, bool kipasON) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["device"]          = "Chamber 1";
  doc["suhu"]            = bmeOk ? round(suhu * 10) / 10.0 : 0;
  doc["kelembaban"]      = bmeOk ? round(hum  * 10) / 10.0 : 0;
  doc["tekanan"]         = bmeOk ? round(tek  * 10) / 10.0 : 0;
  doc["gas_metana"]      = mqOk  ? round(ppmAvg) : 0;
  doc["syringe_present"] = (digitalRead(SYRINGE_PIN) == HIGH) ? 1 : 0;
  doc["kipas_on"]        = kipasON ? 1 : 0; 

  String jsonStr;
  serializeJson(doc, jsonStr);
  int httpCode = http.POST(jsonStr);
  
  if (httpCode == 200 || httpCode == 201) {
    String payload = http.getString();
    Serial.println("[HTTP] Berhasil mengirim data ke server.");

    DynamicJsonDocument docRes(1024);
    DeserializationError err = deserializeJson(docRes, payload);
    if (!err) {
      JsonArray commands = docRes["commands"];
      if (commands && commands.size() > 0) {
        Serial.println("[SERVER] Menerima instruksi baru!");
        for (JsonVariant cmd : commands) {
          String namaPerintah = cmd["command_name"].as<String>();
          String nilaiPerintah = cmd["command_value"].as<String>();

          if (namaPerintah == "Syringe") {
             if (nilaiPerintah == "U" || nilaiPerintah == "UP") {
                Serial.println(" -> Eksekusi Syringe NAIK");
                gerakStepper(true, 3750);
             } 
             else if (nilaiPerintah == "D" || nilaiPerintah == "DOWN") {
                Serial.println(" -> Eksekusi Syringe TURUN");
                gerakStepper(false, 3750);
             }
          }
          else if (namaPerintah == "Kipas") {
             if (nilaiPerintah == "1") {
                Serial.println(" -> Eksekusi Kipas ON");
                digitalWrite(RELAY_PIN, HIGH);
             } else if (nilaiPerintah == "0") {
                Serial.println(" -> Eksekusi Kipas OFF");
                digitalWrite(RELAY_PIN, LOW);
             }
          }
        }
      }
    } else {
      Serial.printf("[JSON] Gagal parsing respon: %s\n", err.c_str());
    }
  } else {
    Serial.printf("[HTTP] GAGAL POST - code: %d\n", httpCode);
  }
  http.end();
}