#include <Wire.h>
#include <Adafruit_BME280.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ===================== KONFIGURASI WiFi =====================
const char* WIFI_SSID     = "1234";
const char* WIFI_PASSWORD = "12345678";

// ===================== KONFIGURASI SERVER =====================
const char* SERVER_URL = "http://10.40.87.115:3000/api/data";

// ===================== KONFIGURASI PIN =====================
#define SDA_PIN     21
#define SCL_PIN     22
#define MQ4_1_PIN   34
#define MQ4_2_PIN   35

// ===================== KONFIGURASI AVERAGING =====================
#define JUMLAH_SAMPLE   5
#define DELAY_SAMPLE    100
#define DELAY_LOOP      5000

// ===================== OBJEK SENSOR =====================
Adafruit_BME280 bme1;   // BME280 atas  - 0x76 (SDO ke GND)
Adafruit_BME280 bme2;   // BME280 bawah - 0x77 (SDO ke 3.3V)

bool bme1Status = false;
bool bme2Status = false;

// ===================================================================
//  SETUP
// ===================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);
  initSensor();
  initWiFi();
}

// ===================================================================
//  LOOP UTAMA
// ===================================================================
void loop() {
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

  // Rata-rata BME280
  float suhuAvg = 0, humAvg = 0, tekAvg = 0;
  int   bmeValid = 0;
  if (bme1Ok) { suhuAvg += suhu1; humAvg += hum1; tekAvg += tek1; bmeValid++; }
  if (bme2Ok) { suhuAvg += suhu2; humAvg += hum2; tekAvg += tek2; bmeValid++; }
  if (bmeValid > 0) { suhuAvg /= bmeValid; humAvg /= bmeValid; tekAvg /= bmeValid; }

  // Rata-rata MQ-4
  float adcAvg = 0;
  int   mqValid = 0;
  if (adc1 >= 0) { adcAvg += adc1; mqValid++; }
  if (adc2 >= 0) { adcAvg += adc2; mqValid++; }
  if (mqValid > 0) adcAvg /= mqValid;

  float ppmAvg = 200.0 + (adcAvg / 4095.0) * 9800.0;
  float ppm1   = 200.0 + (adc1  / 4095.0) * 9800.0;
  float ppm2   = 200.0 + (adc2  / 4095.0) * 9800.0;

  // Output Serial Monitor
  Serial.printf("[ATAS]  Suhu: %.2f C | Kelembapan: %.2f %% | Tekanan: %.2f hPa | Gas: %.0f ppm\n", suhu1, hum1, tek1, ppm1);
  Serial.printf("[BAWAH] Suhu: %.2f C | Kelembapan: %.2f %% | Tekanan: %.2f hPa | Gas: %.0f ppm\n", suhu2, hum2, tek2, ppm2);
  Serial.printf("[AVG]   Suhu: %.2f C | Kelembapan: %.2f %% | Tekanan: %.2f hPa | Gas: %.0f ppm\n\n", suhuAvg, humAvg, tekAvg, ppmAvg);

  // Kirim ke server
  if (WiFi.status() == WL_CONNECTED) {
    kirimData(suhuAvg, humAvg, tekAvg, (bmeValid > 0), ppmAvg, (mqValid > 0));
  } else {
    Serial.println("[WiFi] Terputus, reconnect...");
    initWiFi();
  }

  delay(DELAY_LOOP);
}

// ===================================================================
//  FUNGSI: Inisialisasi sensor
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
//  FUNGSI: Baca & Averaging BME280
// ===================================================================
bool bacaBME(Adafruit_BME280 &bme, const char* label,
             float &suhu, float &hum, float &tek) {
  float tS = 0, tH = 0, tT = 0;
  int ok = 0;

  for (int i = 0; i < JUMLAH_SAMPLE; i++) {
    float s = bme.readTemperature();
    float h = bme.readHumidity();
    float p = bme.readPressure() / 100.0F;
    if (!isnan(s) && !isnan(h) && !isnan(p)) {
      tS += s; tH += h; tT += p; ok++;
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
//  FUNGSI: Baca & Averaging MQ-4
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
//  FUNGSI: Kirim data ke server
// ===================================================================
void kirimData(float suhu, float hum, float tek, bool bmeOk,
               float ppmAvg, bool mqOk) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["suhu"]       = bmeOk ? round(suhu * 10) / 10.0 : 0;
  doc["kelembaban"] = bmeOk ? round(hum  * 10) / 10.0 : 0;
  doc["tekanan"]    = bmeOk ? round(tek  * 10) / 10.0 : 0;
  doc["gas_metana"] = mqOk  ? round(ppmAvg) : 0;
  doc["device"]     = "ESP32-WROOM-Apis";

  String jsonStr;
  serializeJson(doc, jsonStr);

  int httpCode = http.POST(jsonStr);
  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[HTTP] OK - %s\n", http.getString().c_str());
  } else {
    Serial.printf("[HTTP] GAGAL - code: %d\n", httpCode);
  }

  http.end();
}
