package com.shihou.utils;

import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.TimeSlotScore;
import com.shihou.entity.CityEnvironmentEntity;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public final class RiskCalculator {
    private static final Map<String, Integer> GROUP_FACTOR = Map.of(
            "普通人群", 0,
            "儿童青少年", 7,
            "老年人", 12,
            "敏感人群", 17
    );
    private static final Map<String, Integer> INTENSITY_FACTOR = Map.of(
            "低强度", 0,
            "中强度", 6,
            "高强度", 13
    );
    private static final Map<Integer, Integer> HOURLY_OFFSET = Map.ofEntries(
            Map.entry(6, -5), Map.entry(7, -4), Map.entry(8, -2), Map.entry(9, 0),
            Map.entry(10, 2), Map.entry(11, 4), Map.entry(12, 6), Map.entry(13, 8),
            Map.entry(14, 9), Map.entry(15, 7), Map.entry(16, 4), Map.entry(17, 1),
            Map.entry(18, -2), Map.entry(19, -4), Map.entry(20, -5)
    );

    private RiskCalculator() {
    }

    public static List<TimeSlotScore> calculateSlots(CityEnvironmentEntity city, ActivityDecisionRequest input) {
        List<TimeSlotScore> slots = new ArrayList<>();
        for (int hour = 6; hour <= 20; hour++) {
            int offset = HOURLY_OFFSET.getOrDefault(hour, 0);
            double temperature = Math.round((city.getTemperature() + offset * 0.45) * 10.0) / 10.0;
            int heatRisk = (int) Math.round(clamp(city.getHeatRisk() + offset * 2.2
                    + INTENSITY_FACTOR.getOrDefault(input.intensity(), 6)));
            int aqi = (int) Math.round(clamp(city.getAqi() + Math.sin(hour * 0.9) * 9, 18, 180));
            int rain = (int) Math.round(clamp(city.getRainProbability() + Math.cos(hour * 0.65) * 8));
            double risk = heatRisk * 0.42
                    + clamp((aqi - 35) * 0.75) * 0.28
                    + rain * 0.18
                    + GROUP_FACTOR.getOrDefault(input.group(), 7)
                    + Math.max(0, input.duration() - 2) * 4;
            int score = (int) Math.round(clamp(100 - risk));
            slots.add(new TimeSlotScore(hour, "%02d:00".formatted(hour), temperature, aqi,
                    heatRisk, rain, score, levelOf(score)));
        }
        return slots;
    }

    public static TimeSlotScore bestSlot(List<TimeSlotScore> slots) {
        return slots.stream().max(Comparator.comparingInt(TimeSlotScore::score)).orElseThrow();
    }

    private static String levelOf(int score) {
        if (score >= 72) return "适宜";
        if (score >= 48) return "谨慎";
        return "不建议";
    }

    private static double clamp(double value) {
        return clamp(value, 0, 100);
    }

    private static double clamp(double value, double min, double max) {
        return Math.min(max, Math.max(min, value));
    }
}

