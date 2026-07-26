import os
import time
import sys
import board
import adafruit_dht
from gpiozero import LED, Buzzer

# ==========================================
# Konfigurasi Pin (Gunakan penomoran BCM)
# ==========================================
# DHT11 terhubung ke GPIO 4 (Pin Fisik 7)
PIN_DHT = board.D4

# Inisialisasi LED menggunakan gpiozero
# Parameter active_high=False diset karena LED Anda jenis Common Anode
led_merah = LED(5, active_high=False)
led_hijau = LED(6, active_high=False)

# Inisialisasi Buzzer (MH-FMD Aktif menyala saat HIGH)
buzzer = Buzzer(17)

# ==========================================
# Konfigurasi Batasan Suhu Yang Mulia
# ==========================================
SUHU_AMAN_MAX = 29     # Di bawah 30 derajat = Aman (Hijau)
SUHU_SEDANG_MAX = 34   # 30 s/d 34 derajat = Sedang (Kuning)
                       # Di atas 34 derajat = Bahaya/Panas (Merah + Buzzer)

def matikan_semua():
    led_merah.off()
    led_hijau.off()
    buzzer.off()

def nyalakan_hijau():
    led_merah.off()
    led_hijau.on()

def nyalakan_kuning():
    # Kombinasi Merah + Hijau menghasilkan warna Kuning pada Bi-LED
    led_merah.on()
    led_hijau.on()

def nyalakan_merah():
    led_merah.on()
    led_hijau.off()

def clear_screen():
    os.system('clear' if os.name == 'posix' else 'cls')

def main():
    clear_screen()
    print("==========================================")
    print(" Mempersiapkan Sistem Monitoring Yang Mulia")
    print("==========================================")
    
    matikan_semua()
    
    # Inisialisasi sensor di dalam fungsi main agar lebih aman
    try:
        sensor_dht = adafruit_dht.DHT11(PIN_DHT)
    except Exception as e:
        print(f"❌ Gagal menginisialisasi sirkuit sensor: {e}")
        sys.exit(1)
        
    time.sleep(1.0) # Jeda stabilisasi hardware
    
    print(" -> Sistem Siap. Memulai pembacaan data...")
    time.sleep(1.0)
    
    try:
        while True:
            try:
                # Log indikator sebelum eksekusi (agar kita tahu program bekerja dan tidak macet)
                print(" -> Mencoba berkomunikasi dengan sensor...", end="\r")
                
                # Membaca data dari DHT11
                temperature = sensor_dht.temperature
                humidity = sensor_dht.humidity
                
                # Jika berhasil membaca tanpa error, bersihkan layar dan tampilkan data
                clear_screen()
                print("=======================================")
                print(" MONITORING AREA (DHT11 + Bi-LED + Buzzer)")
                print("=======================================")
                print("Tekan Ctrl+C untuk keluar dari program\n")
                
                if temperature is not None:
                    if temperature <= SUHU_AMAN_MAX:
                        nyalakan_hijau()
                        buzzer.off()
                        status = "AMAN (Hijau)"
                    elif temperature <= SUHU_SEDANG_MAX:
                        nyalakan_kuning()
                        buzzer.off()
                        status = "SEDANG / PERHATIAN (Kuning)"
                    else:
                        nyalakan_merah()
                        buzzer.on()
                        status = "BAHAYA / PANAS! (Merah + Buzzer)"
                    
                    print(f" Suhu Terkini : {temperature:.1f} °C")
                    print(f" Kelembaban   : {humidity:.1f} %")
                    print(f" Status Area  : {status}")
                    print("=======================================")
                else:
                    print(" -> Data kosong. Mencoba kembali...")
                    
            except RuntimeError as error:
                # Sensor DHT11 terkenal sering 'loss' komunikasi sesaat, 
                # kita tangkap error-nya dan biarkan loop terus berjalan tanpa berhenti
                print(f" [Sinyal Delay] {error.args[0]}... Mencoba ulang.", end="\r")
                pass
            except Exception as error_besar:
                print(f"\n❌ Terjadi kesalahan sistem: {error_besar}")
                break
                
            # DHT11 membutuhkan jeda minimal 2 detik antar pembacaan agar akurat
            time.sleep(2.0)
            
    except KeyboardInterrupt:
        print("\n\n[INFO] Program dihentikan secara normal oleh Yang Mulia.")
    finally:
        # Blok pembersihan total saat keluar program
        matikan_semua()
        led_merah.close()
        led_hijau.close()
        buzzer.close()
        sensor_dht.exit()
        print("Sistem sirkuit dan pin dibersihkan dengan aman! Sampai jumpa.")

if __name__ == '__main__':
    main()