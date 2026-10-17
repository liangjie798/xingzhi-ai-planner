package com.shihou.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "city_environment")
public class CityEnvironmentEntity {
    @Id
    private String id;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private String province;
    @Column(nullable = false, unique = true)
    private String adcode;
    private double longitude;
    private double latitude;
    private String weather;
    private double temperature;
    private int humidity;
    private int windPower;
    private int rainProbability;
    private int aqi;
    private int pm25;
    private int heatRisk;
    private Instant updatedAt;
    private String sourceMode;

    protected CityEnvironmentEntity() {
    }

    public CityEnvironmentEntity(String id, String name, String province, String adcode, double longitude,
                                 double latitude, String weather, double temperature, int humidity,
                                 int windPower, int rainProbability, int aqi, int pm25, int heatRisk,
                                 Instant updatedAt, String sourceMode) {
        this.id = id;
        this.name = name;
        this.province = province;
        this.adcode = adcode;
        this.longitude = longitude;
        this.latitude = latitude;
        this.weather = weather;
        this.temperature = temperature;
        this.humidity = humidity;
        this.windPower = windPower;
        this.rainProbability = rainProbability;
        this.aqi = aqi;
        this.pm25 = pm25;
        this.heatRisk = heatRisk;
        this.updatedAt = updatedAt;
        this.sourceMode = sourceMode;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getProvince() { return province; }
    public String getAdcode() { return adcode; }
    public double getLongitude() { return longitude; }
    public double getLatitude() { return latitude; }
    public double[] getCenter() { return new double[]{longitude, latitude}; }
    public String getWeather() { return weather; }
    public double getTemperature() { return temperature; }
    public int getHumidity() { return humidity; }
    public int getWindPower() { return windPower; }
    public int getRainProbability() { return rainProbability; }
    public int getAqi() { return aqi; }
    public int getPm25() { return pm25; }
    public int getHeatRisk() { return heatRisk; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getSourceMode() { return sourceMode; }
}

