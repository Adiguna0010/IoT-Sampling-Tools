/*
  ====================================================================
  KODE DIAGNOSTIK / TEST SENSOR BME280 & MQ-4 (SMART CHAMBER)
  ====================================================================
  
  Kode ini digunakan khusus untuk mendeteksi pembacaan sensor:
  - BME280 Atas          : I2C Address 0x76 (SDO -> GND)
  - BME280 Bawah         : I2C Address 0x77 (SDO -> 3.3V)
  - SDA Pin              : GPIO 21
  - SCL Pin              : GPIO 22
  
  - MQ-4 Sensor 1        : Pin Analog GPIO 32
  - MQ-4 Sensor 2        : Pin Analog GPIO 33
  - MQ-4 Sensor 3        : Pin Analog GPIO 34
  
  Fitur Diagnosa:
  1. I2C Scanner: Memindai semua perangkat I2C yang terhubung ke ESP32.
  2. BME280 Reader: Membaca Suhu, Kelembaban, dan Tekanan dari kedua sensor BME280.
  3. MQ-4 Reader: Membaca nilai analog mentah (RAW 0-4095) dan nilai PPM hasil kalkulasi.
*/

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

// ================= KONFIGURASI PIN =================
#define SDA_PIN           21
#define SCL_PIN           22

#define MQ4_1_PIN         32  
#define MQ4_2_PIN         33  
#define MQ4_3_PIN         34  

Adafruit_BME280 bmeAtas;  
Adafruit_BME280 bmeBawah; 

bool bmeAtasFound = false;
bool bmeBawahFound = false;

// Fungsi I2C Scanner untuk melacak alamat sensor
void scanI2CDevices() {
  Serial.println("\n[I2C SCANNER] Memulai pemindaian...");
  byte error, address;
  int nDevices = 0;

  for (address = 1; address < 127; address++ ) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.printf("  -> Perangkat I2C ditemukan di alamat: 0x%02X", address);
      if (address == 0x76) Serial.print(" (Kemungkinan BME280 Atas)");
      else if (address == 0x77) Serial.print(" (Kemungkinan BME280 Bawah)");
      Serial.println();
      nDevices++;
    }
    else if (error == 4) {
      Serial.printf("  -> Error tidak diketahui di alamat: 0x%02X\n", address);
    }
  }
  if (nDevices == 0) {
    Serial.println("[I2C SCANNER] WARNING: Tidak ada perangkat I2C yang terdeteksi! Periksa kabel SDA/SCL & Power!");
  } else {
    Serial.printf("[I2C SCANNER] Pemindaian selesai. Ditemukan %d perangkat.\n", nDevices);
  }
}

// Fungsi konversi analog MQ-4 ke PPM (sesuai rumus program utama)
int hitungPPM(int nilaiAnalog) {
  return map(nilaiAnalog, 0, 4095, 0, 10000); 
}

void setup() {
  // Menggunakan baudrate 9600 agar langsung cocok dengan Serial Monitor Anda (terhindar dari teks buram/garbled)
  Serial.begin(9600);
  delay(1500);
  
  Serial.println("\n=============================================");
  Serial.println("  ESP32 SENSOR BME280 & MQ-4 TEST UTILITY  ");
  Serial.println("=============================================");
  
  // Inisialisasi I2C
  Serial.printf("Menginisialisasi I2C (SDA: GPIO %d, SCL: GPIO %d)...\n", SDA_PIN, SCL_PIN);
  Wire.begin(SDA_PIN, SCL_PIN);
  
  // Jalankan I2C Scanner untuk mendiagnosa sambungan fisik
  scanI2CDevices();
  
  // Inisialisasi BME280 Atas (0x76)
  Serial.println("\nMenghubungkan ke BME280 Atas (0x76)...");
  if (bmeAtas.begin(0x76, &Wire)) {
    Serial.println("[OK] BME280 Atas berhasil terinisialisasi! ✅");
    bmeAtasFound = true;
  } else {
    Serial.println("[FAIL] Gagal menemukan sensor BME280 Atas (0x76) ❌");
  }
  
  // Inisialisasi BME280 Bawah (0x77)
  Serial.println("Menghubungkan ke BME280 Bawah (0x77)...");
  if (bmeBawah.begin(0x77, &Wire)) {
    Serial.println("[OK] BME280 Bawah berhasil terinisialisasi! ✅");
    bmeBawahFound = true;
  } else {
    Serial.println("[FAIL] Gagal menemukan sensor BME280 Bawah (0x77) ❌");
  }
  
  Serial.println("---------------------------------------------");
  Serial.println("Memulai pembacaan data sensor...\n");
}

void loop() {
  Serial.println("=============================================");
  
  // 1. Membaca Sensor BME280 Atas (0x76)
  Serial.println("--- BME280 ATAS (0x76) ---");
  if (bmeAtasFound) {
    float tempA = bmeAtas.readTemperature();
    float humA = bmeAtas.readHumidity();
    float presA = bmeAtas.readPressure() / 100.0F;
    
    Serial.printf("  Suhu       : %.2f C\n", tempA);
    Serial.printf("  Kelembaban : %.2f %%\n", humA);
    Serial.printf("  Tekanan    : %.2f hPa\n", presA);
  } else {
    Serial.println("  [ERROR] Sensor BME280 Atas tidak terhubung / gagal membaca.");
  }
  
  // 2. Membaca Sensor BME280 Bawah (0x77)
  Serial.println("--- BME280 BAWAH (0x77) ---");
  if (bmeBawahFound) {
    float tempB = bmeBawah.readTemperature();
    float humB = bmeBawah.readHumidity();
    float presB = bmeBawah.readPressure() / 100.0F;
    
    Serial.printf("  Suhu       : %.2f C\n", tempB);
    Serial.printf("  Kelembaban : %.2f %%\n", humB);
    Serial.printf("  Tekanan    : %.2f hPa\n", presB);
  } else {
    Serial.println("  [ERROR] Sensor BME280 Bawah tidak terhubung / gagal membaca.");
  }
  
  // 3. Membaca Sensor MQ-4 (Analog)
  Serial.println("--- SENSOR GAS MQ-4 ---");
  int mq1_val = analogRead(MQ4_1_PIN);
  int mq2_val = analogRead(MQ4_2_PIN);
  int mq3_val = analogRead(MQ4_3_PIN);
  
  Serial.printf("  MQ-4 Sensor 1 (Pin %d) -> RAW: %4d | PPM: %d\n", MQ4_1_PIN, mq1_val, hitungPPM(mq1_val));
  Serial.printf("  MQ-4 Sensor 2 (Pin %d) -> RAW: %4d | PPM: %d\n", MQ4_2_PIN, mq2_val, hitungPPM(mq2_val));
  Serial.printf("  MQ-4 Sensor 3 (Pin %d) -> RAW: %4d | PPM: %d\n", MQ4_3_PIN, mq3_val, hitungPPM(mq3_val));
  
  Serial.println("=============================================\n");
  
  // Jeda 2 detik sebelum pembacaan berikutnya
  delay(2000);
}
