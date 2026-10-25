package com.shihou.utils;

import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.EnvironmentalForecastPoint;
import com.shihou.dto.TimeSlotScore;

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
    private static final Map<String, Integer> ACTIVITY_FACTOR = Map.of(
            "校园运动会", 7,
            "体育课", 3,
            "社区活动", 1,
            "户外训练", 10,
            "研学活动", 4,
            "旅游规划", 2
    );
    private RiskCalculator() {
    }

    public static List<TimeSlotScore> calculateSlots(List<EnvironmentalForecastPoint> forecast, ActivityDecisionRequest input) {
        List<TimeSlotScore> slots = new ArrayList<>();
        int earliest = input.allowedStartHour() == null ? 6 : input.allowedStartHour();
        int latestEnd = input.allowedEndHour() == null ? 21 : input.allowedEndHour();
        if (latestEnd <= earliest) throw new IllegalArgumentException("允许结束时间必须晚于开始时间");
        for (EnvironmentalForecastPoint point : forecast) {
            if (point.hour() < earliest || point.hour() + input.duration() > latestEnd) continue;
            // A slot is valid only if every hour of the activity is present on the same day.
            List<EnvironmentalForecastPoint> window = new ArrayList<>();
            for (int offset = 0; offset < input.duration(); offset++) {
                final int hour = point.hour() + offset;
                forecast.stream().filter(p -> java.util.Objects.equals(p.date(), point.date()) && p.hour() == hour).findFirst().ifPresent(window::add);
            }
            if (window.size() != input.duration()) continue;
            int maximumHeat = window.stream().mapToInt(EnvironmentalForecastPoint::heatRisk).max().orElseThrow();
            int maximumAqi = window.stream().mapToInt(EnvironmentalForecastPoint::aqi).max().orElseThrow();
            int maximumRain = window.stream().mapToInt(EnvironmentalForecastPoint::rainProbability).max().orElseThrow();
            double averageTemperature = Math.round(window.stream().mapToDouble(EnvironmentalForecastPoint::temperature).average().orElseThrow() * 10) / 10.0;
            int heatRisk = (int) Math.round(clamp(maximumHeat
                    + INTENSITY_FACTOR.getOrDefault(input.intensity(), 6)));
            double risk = heatRisk * 0.42
                    + clamp((maximumAqi - 35) * 0.75) * 0.28
                    + maximumRain * 0.18
                    + GROUP_FACTOR.getOrDefault(input.group(), 7)
                    + ACTIVITY_FACTOR.getOrDefault(input.activityType(), 3)
                    + Math.max(0, input.duration() - 1) * 4;
            int score = (int) Math.round(clamp(100 - risk));
            String label = point.date() == null || point.date().equals(input.date())
                    ? "%02d:00".formatted(point.hour())
                    : point.date().substring(5) + " %02d:00".formatted(point.hour());
            slots.add(new TimeSlotScore(point.date(), point.hour(), label, averageTemperature, maximumAqi,
                    heatRisk, maximumRain, score, levelOf(score)));
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

