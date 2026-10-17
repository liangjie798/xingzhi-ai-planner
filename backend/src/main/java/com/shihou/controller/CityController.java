package com.shihou.controller;

import com.shihou.annotation.Traceable;
import com.shihou.entity.CityEnvironmentEntity;
import com.shihou.dto.CitySearchResult;
import com.shihou.dto.HourlyEnvironmentResponse;
import com.shihou.service.EnvironmentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.time.LocalDate;

@Traceable
@RestController
@RequestMapping("/api/v1/cities")
public class CityController {
    private final EnvironmentService environmentService;

    public CityController(EnvironmentService environmentService) {
        this.environmentService = environmentService;
    }

    @GetMapping
    public List<CityEnvironmentEntity> list() {
        return environmentService.listCities();
    }

    @GetMapping("/{cityId}")
    public CityEnvironmentEntity detail(@PathVariable String cityId) {
        return environmentService.getCity(cityId);
    }

    @GetMapping("/search")
    public List<CitySearchResult> search(@RequestParam String q) {
        return environmentService.searchCities(q);
    }

    @GetMapping("/environment")
    public CityEnvironmentEntity environment(
            @RequestParam String cityId,
            @RequestParam String name,
            @RequestParam String province,
            @RequestParam(required = false, defaultValue = "") String adcode,
            @RequestParam double longitude,
            @RequestParam double latitude) {
        return environmentService.getCity(cityId, name, province, adcode, longitude, latitude);
    }

    @GetMapping("/hourly")
    public HourlyEnvironmentResponse hourly(
            @RequestParam String cityId,
            @RequestParam String date,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String province,
            @RequestParam(required = false, defaultValue = "") String adcode,
            @RequestParam(required = false) Double longitude,
            @RequestParam(required = false) Double latitude) {
        LocalDate requestedDate = LocalDate.parse(date);
        CityEnvironmentEntity city = longitude == null || latitude == null
                ? environmentService.getCity(cityId)
                : environmentService.getCity(cityId, name, province, adcode, longitude, latitude);
        List<com.shihou.dto.EnvironmentalForecastPoint> hours = longitude == null || latitude == null
                ? environmentService.getForecast(cityId, requestedDate)
                : environmentService.getForecast(cityId, name, province, adcode, longitude, latitude, requestedDate);
        return new HourlyEnvironmentResponse(city, requestedDate, hours);
    }
}

