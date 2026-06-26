import RPi.GPIO as GPIO
import time

# Konfigurasi Pin (menggunakan penomoran BCM / GPIO)
PIN_RED = 5
PIN_GREEN = 6

def setup():
    # Menonaktifkan peringatan
    GPIO.setwarnings(False)
    
    # Menggunakan penomoran BCM
    GPIO.setmode(GPIO.BCM)
    
    # Atur pin sebagai output
    GPIO.setup(PIN_RED, GPIO.OUT)
    GPIO.setup(PIN_GREEN, GPIO.OUT)
    
    # Matikan LED pada awalnya
    matikan_led()

def matikan_led():
    # Common Anode: set HIGH (1) untuk mematikan
    GPIO.output(PIN_RED, GPIO.HIGH)
    GPIO.output(PIN_GREEN, GPIO.HIGH)

def nyalakan_merah():
    # Common Anode: set LOW (0) untuk menyalakan
    GPIO.output(PIN_RED, GPIO.LOW)
    GPIO.output(PIN_GREEN, GPIO.HIGH)

def nyalakan_hijau():
    GPIO.output(PIN_RED, GPIO.HIGH)
    GPIO.output(PIN_GREEN, GPIO.LOW)

def nyalakan_kuning():
    # Nyalakan merah dan hijau untuk menghasilkan warna kuning
    GPIO.output(PIN_RED, GPIO.LOW)
    GPIO.output(PIN_GREEN, GPIO.LOW)

def main():
    setup()
    try:
        print("Kontrol Bi-Color LED (Common Anode) di Raspberry Pi 3B")
        print("=====================================================")
        print("0 : Matikan LED")
        print("1 : Nyalakan Merah")
        print("2 : Nyalakan Kuning")
        print("3 : Nyalakan Hijau")
        print("Ketik 'q' atau tekan Ctrl+C untuk keluar")
        print("=====================================================")
        
        while True:
            perintah = input("Masukkan perintah (0/1/2/3): ")
            
            if perintah == '0':
                matikan_led()
                print("-> LED Dimatikan")
            elif perintah == '1':
                nyalakan_merah()
                print("-> LED Merah Menyala")
            elif perintah == '2':
                nyalakan_kuning()
                print("-> LED Kuning Menyala")
            elif perintah == '3':
                nyalakan_hijau()
                print("-> LED Hijau Menyala")
            elif perintah.lower() == 'q':
                print("Keluar dari program...")
                break
            else:
                print("-> Perintah tidak valid! Silakan masukkan 0, 1, 2, atau 3.")
                
    except KeyboardInterrupt:
        print("\nProgram dihentikan oleh user.")
    finally:
        # Bersihkan konfigurasi pin saat program selesai
        matikan_led()
        GPIO.cleanup()

if __name__ == '__main__':
    main()
