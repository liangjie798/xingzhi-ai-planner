package com.shihou.controller;

import com.shihou.annotation.Traceable;
import com.shihou.entity.CityEnvironmentEntity;
import com.shihou.service.EnvironmentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

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
}

