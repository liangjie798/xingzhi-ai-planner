package com.shihou.dto;

import com.shihou.entity.CityEnvironmentEntity;

import java.time.LocalDate;
import java.util.List;

public record HourlyEnvironmentResponse(
        CityEnvironmentEntity city,
        LocalDate date,
        List<EnvironmentalForecastPoint> hours
) { }
