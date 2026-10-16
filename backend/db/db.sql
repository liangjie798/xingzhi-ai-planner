CREATE DATABASE IF NOT EXISTS shihou CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shihou;

CREATE TABLE IF NOT EXISTS city_environment (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    province VARCHAR(64) NOT NULL,
    adcode VARCHAR(12) NOT NULL UNIQUE,
    longitude DECIMAL(10, 6) NOT NULL,
    latitude DECIMAL(10, 6) NOT NULL,
    weather VARCHAR(32),
    temperature DECIMAL(5, 2),
    humidity INT,
    wind_power INT,
    rain_probability INT,
    aqi INT,
    pm25 INT,
    heat_risk INT,
    updated_at TIMESTAMP NOT NULL,
    source_mode VARCHAR(16) NOT NULL
);

CREATE TABLE IF NOT EXISTS decision_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    city_id VARCHAR(32) NOT NULL,
    activity_type VARCHAR(64) NOT NULL,
    overall_score INT NOT NULL,
    overall_level VARCHAR(16) NOT NULL,
    generated_by VARCHAR(32) NOT NULL,
    request_payload LONGTEXT,
    result_summary LONGTEXT,
    created_at TIMESTAMP NOT NULL,
    INDEX idx_decision_city_created (city_id, created_at)
);

