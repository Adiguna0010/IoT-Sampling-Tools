CREATE DATABASE IF NOT EXISTS iot_padi;
USE iot_padi;
CREATE TABLE chambers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chamber_name VARCHAR(100),
    location VARCHAR(100),
    created_at DATETIME
);
CREATE TABLE daftar_device (
    chamber_id VARCHAR(100) PRIMARY KEY,
    status VARCHAR(50),
    last_seen DATETIME
);
CREATE TABLE commands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chamber_id INT,
    command_name VARCHAR(100),
    command_value VARCHAR(100),
    created_at DATETIME
);
CREATE TABLE sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_device VARCHAR(100),
    nama_sensor VARCHAR(100),
    suhu FLOAT,
    kelembaban FLOAT,
    tekanan FLOAT,
    gas_metana INT,
    waktu_masuk DATETIME,
    syringe_status INT 
);