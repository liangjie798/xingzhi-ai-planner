package com.shihou.utils;

import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.EnvironmentalForecastPoint;
import com.shihou.dto.TimeSlotScore;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

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
        return calculateSlots(forecast, input, Clock.system(ZoneId.of("Asia/Shanghai")));
    }

    public static List<TimeSlotScore> calculateSlots(List<EnvironmentalForecastPoint> forecast, ActivityDecisionRequest input, Clock clock) {
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), ZoneId.of("Asia/Shanghai"));
        List<TimeSlotScore> slots = new ArrayList<>();
        int earliest = input.allowedStartHour() == null ? 6 : input.allowedStartHour();
        int latestEnd = input.allowedEndHour() == null ? 21 : input.allowedEndHour();
        if (latestEnd <= earliest) throw new IllegalArgumentException("允许结束时间必须晚于开始时间");
        Map<String, Integer> occurrences = new HashMap<>();
        for (EnvironmentalForecastPoint point : forecast) {
            if (validPoint(point)) occurrences.merge(point.date() + "#" + point.hour(), 1, Integer::sum);
        }
        for (EnvironmentalForecastPoint point : forecast) {
            if (!validPoint(point) || occurrences.getOrDefault(point.date() + "#" + point.hour(), 0) != 1) continue;
            if (point.hour() < earliest || point.hour() + input.duration() > latestEnd) continue;
            String date = point.date() == null ? input.date() : point.date();
            // Exported preparation/check-in needs one hour before the event.
            if (date.compareTo(now.toLocalDate().toString()) < 0 || date.equals(now.toLocalDate().toString()) && point.hour() * 60 < now.getHour() * 60 + now.getMinute() + 60) continue;
            // A slot is valid only if every hour of the activity is present on the same day.
            List<EnvironmentalForecastPoint> window = new ArrayList<>();
            for (int offset = 0; offset < input.duration(); offset++) {
                final int hour = point.hour() + offset;
                List<EnvironmentalForecastPoint> matches = forecast.stream()
                        .filter(RiskCalculator::validPoint)
                        .filter(p -> java.util.Objects.equals(p.date(), point.date()) && p.hour() == hour)
                        .toList();
                if (matches.size() == 1) window.add(matches.getFirst());
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

    private static boolean validPoint(EnvironmentalForecastPoint point) {
        return point != null && point.date() != null && point.date().matches("\\d{4}-\\d{2}-\\d{2}")
                && point.hour() >= 0 && point.hour() <= 23
                && Double.isFinite(point.temperature()) && point.temperature() >= -90 && point.temperature() <= 60
                && point.humidity() >= 0 && point.humidity() <= 100
                && point.rainProbability() >= 0 && point.rainProbability() <= 100
                && point.aqi() >= 0 && point.aqi() <= 500
                && point.pm25() >= 0 && point.pm25() <= 2000
                && point.heatRisk() >= 0 && point.heatRisk() <= 100;
    }

    private static double clamp(double value) {
        return clamp(value, 0, 100);
    }

    private static double clamp(double value, double min, double max) {
        return Math.min(max, Math.max(min, value));
    }
}

