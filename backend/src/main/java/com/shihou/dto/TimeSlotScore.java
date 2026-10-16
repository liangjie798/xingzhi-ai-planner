package com.shihou.dto;

public record TimeSlotScore(
        int hour,
        String label,
        double temperature,
        int aqi,
        int heatRisk,
        int rainProbability,
        int score,
        String level
) {
}

