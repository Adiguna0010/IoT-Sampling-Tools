import RPi.GPIO as GPIO
import time

# ==========================================
# Konfigurasi Pin
# ==========================================
# Pastikan menggunakan pin yang sama seperti sebelumnya
PIN_BUZZER = 17

def setup():
    # Menonaktifkan peringatan
    GPIO.setwarnings(False)
    
    # Menggunakan penomoran BCM (GPIO)
    GPIO.setmode(GPIO.BCM)
    
    # Atur pin buzzer sebagai output
    GPIO.setup(PIN_BUZZER, GPIO.OUT)
    
    # Matikan buzzer pada awalnya
    matikan_buzzer()

def nyalakan_buzzer():
    # Modul buzzer aktif umumnya menyala saat diberi sinyal HIGH
    GPIO.output(PIN_BUZZER, GPIO.HIGH)

def matikan_buzzer():
    GPIO.output(PIN_BUZZER, GPIO.LOW)

def bunyikan_bip(durasi_nyala, durasi_mati, jumlah):
    """
    Fungsi untuk membunyikan buzzer putus-putus
    """
    for _ in range(jumlah):
        nyalakan_buzzer()
        time.sleep(durasi_nyala)
        matikan_buzzer()
        time.sleep(durasi_mati)

def main():
    setup()
    try:
        print("=======================================")
        print(" Kontrol Buzzer Aktif (MH-FMD)")
        print("=======================================")
        print("0 : Matikan Buzzer")
        print("1 : Nyalakan Buzzer (Terus-menerus)")
        print("2 : Bunyikan Bip Pendek (1x)")
        print("3 : Bunyikan Alarm Bip (3x)")
        print("Ketik 'q' atau tekan Ctrl+C untuk keluar")
        print("=======================================")
        
        while True:
            perintah = input("Masukkan perintah (0/1/2/3/q): ")
            
            if perintah == '0':
                matikan_buzzer()
                print("-> Buzzer Dimatikan")
            elif perintah == '1':
                nyalakan_buzzer()
                print("-> Buzzer Menyala (Ketik 0 untuk mematikan)")
            elif perintah == '2':
                print("-> Beep 1x...")
                bunyikan_bip(0.2, 0.2, 1)
            elif perintah == '3':
                print("-> Alarm Beep 3x...")
                bunyikan_bip(0.4, 0.2, 3)
            elif perintah.lower() == 'q':
                print("Keluar dari program...")
                break
            else:
                print("-> Perintah tidak valid! Silakan masukkan 0, 1, 2, atau 3.")
                
    except KeyboardInterrupt:
        print("\nProgram dihentikan oleh user.")
    finally:
        # Selalu pastikan buzzer dimatikan dan pin dibersihkan saat keluar
        matikan_buzzer()
        GPIO.cleanup()

if __name__ == '__main__':
    main()
