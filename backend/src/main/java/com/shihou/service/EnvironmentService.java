package com.shihou.service;

import com.shihou.dao.CityEnvironmentRepository;
import com.shihou.entity.CityEnvironmentEntity;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class EnvironmentService {
    private final CityEnvironmentRepository repository;

    public EnvironmentService(CityEnvironmentRepository repository) {
        this.repository = repository;
    }

    public List<CityEnvironmentEntity> listCities() {
        return repository.findAll();
    }

    public CityEnvironmentEntity getCity(String cityId) {
        return repository.findById(cityId)
                .orElseThrow(() -> new IllegalArgumentException("暂不支持该城市: " + cityId));
    }

    @PostConstruct
    void seedDemoData() {
        if (repository.count() > 0) return;
        Instant now = Instant.now();
        repository.saveAll(List.of(
                city("beijing", "北京市", "北京市", "110000", 116.397428, 39.90923, "晴间多云", 24, 42, 2, 8, 72, 46, 35, now),
                city("shanghai", "上海市", "上海市", "310000", 121.473701, 31.230416, "多云", 27, 68, 3, 22, 58, 34, 52, now),
                city("guangzhou", "广州市", "广东省", "440100", 113.264385, 23.129112, "阵雨", 31, 77, 2, 62, 46, 24, 76, now),
                city("shenzhen", "深圳市", "广东省", "440300", 114.057868, 22.543099, "多云有阵雨", 30, 75, 3, 55, 42, 21, 71, now),
                city("hangzhou", "杭州市", "浙江省", "330100", 120.15507, 30.274085, "晴", 28, 61, 2, 12, 64, 39, 58, now),
                city("chengdu", "成都市", "四川省", "510100", 104.066541, 30.572269, "阴", 25, 71, 1, 28, 83, 55, 47, now),
                city("wuhan", "武汉市", "湖北省", "420100", 114.305393, 30.593099, "晴热", 32, 66, 2, 16, 69, 41, 82, now),
                city("nanjing", "南京市", "江苏省", "320100", 118.796877, 32.060255, "多云", 29, 63, 2, 19, 74, 45, 64, now),
                city("xian", "西安市", "陕西省", "610100", 108.93977, 34.341574, "晴", 26, 45, 2, 5, 91, 61, 44, now)
        ));
    }

    private CityEnvironmentEntity city(String id, String name, String province, String adcode,
                                       double longitude, double latitude, String weather, double temperature,
                                       int humidity, int windPower, int rain, int aqi, int pm25, int heat,
                                       Instant updatedAt) {
        return new CityEnvironmentEntity(id, name, province, adcode, longitude, latitude, weather,
                temperature, humidity, windPower, rain, aqi, pm25, heat, updatedAt, "demo");
    }
}

