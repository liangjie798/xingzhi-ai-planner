package com.shihou.dto;

public record EnvironmentalForecastPoint(
        String date,
        int hour,
        double temperature,
        int humidity,
        int rainProbability,
        int aqi,
        int pm25,
        int heatRisk
) {
}
