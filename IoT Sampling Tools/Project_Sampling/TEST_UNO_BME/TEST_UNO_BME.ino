#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

// Membuat objek bme
Adafruit_BME280 bme; 

void setup() {
  Serial.begin(9600);
  
  // Menunggu Serial Monitor siap (khusus untuk board berbasis ATmega32U4 seperti Leonardo/Micro)
  while(!Serial);    
  
  Serial.println(F("--- Tes BME280 (Konfigurasi SDO ke GND) ---"));

  // PENTING: Menggunakan 0x76 karena pin SDO dihubungkan ke GND
  if (!bme.begin(0x76)) {
    Serial.println(F("Error: Sensor BME280 tidak ditemukan pada alamat 0x76!"));
    Serial.println(F("Periksa kembali sambungan kabel VCC, GND, SDA, SCL, dan pastikan SDO benar ke GND."));
    while (1); // Program berhenti di sini jika gagal terdeteksi
  }

  Serial.println(F("BME280 terdeteksi pada alamat 0x76. Mulai membaca data...\n"));
}

void loop() {
  // Membaca data dari sensor
  float suhu = bme.readTemperature();             // °C
  float tekanan = bme.readPressure() / 100.0F;     // Diubah dari Pascal ke hPa
  float kelembapan = bme.readHumidity();           // %
  
  // Menghitung perkiraan ketinggian berdasarkan tekanan permukaan laut standar (1013.25 hPa)
  float ketinggian = bme.readAltitude(1013.25);    // Meter

  // Menampilkan hasil ke Serial Monitor
  Serial.print("Suhu        : ");
  Serial.print(suhu);
  Serial.println(" °C");

  Serial.print("Kelembapan  : ");
  Serial.print(kelembapan);
  Serial.println(" %");

  Serial.print("Tekanan Udara: ");
  Serial.print(tekanan);
  Serial.println(" hPa");

  Serial.print("Perkiraan Alt: ");
  Serial.print(ketinggian);
  Serial.println(" m");

  Serial.println(F("-------------------------------------"));
  
  // Mengambil data setiap 2 detik
  delay(2000); 
}
