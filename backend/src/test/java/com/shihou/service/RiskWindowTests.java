package com.shihou.service;

import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.EnvironmentalForecastPoint;
import com.shihou.utils.RiskCalculator;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class RiskWindowTests {
    private final java.time.Clock clock = java.time.Clock.fixed(java.time.Instant.parse("2026-10-25T00:00:00Z"), java.time.ZoneOffset.UTC);
    ActivityDecisionRequest input(int duration, String group, Integer from, Integer to) {
        return new ActivityDecisionRequest("xian", "校园运动会", "2026-10-26", "2026-10-27", 14, duration, 30, "中强度", group, "西安市活动场地", "西安市", "陕西省", "610100", 108.9, 34.2, null, from, to);
    }
    List<EnvironmentalForecastPoint> forecast() {
        var points = new ArrayList<EnvironmentalForecastPoint>();
        for (String date : List.of("2026-10-26", "2026-10-27")) for (int hour=6; hour<=20; hour++)
            points.add(new EnvironmentalForecastPoint(date, hour, 20, 50, hour==15?90:0, hour==15?180:30, 10, hour==15?80:10));
        return points;
    }
    @Test void completeWindowIncludesWorseSecondHourAndHonorsAfternoonEndBoundary() {
        var two = RiskCalculator.calculateSlots(forecast(), input(2,"普通人群",12,18), clock);
        assertTrue(two.stream().allMatch(slot -> slot.hour()>=12 && slot.hour()+2<=18));
        var fourteen = two.stream().filter(slot -> slot.hour()==14).findFirst().orElseThrow();
        assertEquals(180, fourteen.aqi()); assertEquals(90, fourteen.rainProbability());
        var one = RiskCalculator.calculateSlots(forecast(), input(1,"普通人群",12,18), clock);
        assertTrue(one.stream().filter(slot -> slot.hour()==14).findFirst().orElseThrow().score() > fourteen.score());
        assertTrue(two.stream().map(slot -> slot.date()).distinct().count()==2);
        var senior = RiskCalculator.calculateSlots(forecast(), input(1,"老年人",12,18), clock);
        assertTrue(senior.getFirst().score()<one.getFirst().score());
    }
    @Test void aMissingHourOrNextDayNeverCompletesAnActivityWindow() {
        var points = new ArrayList<>(forecast()); points.removeIf(point -> point.date().equals("2026-10-26") && point.hour()==15);
        var slots = RiskCalculator.calculateSlots(points, input(2,"普通人群",12,18), clock);
        assertFalse(slots.stream().anyMatch(slot -> slot.date().equals("2026-10-26") && (slot.hour()==14 || slot.hour()==15)));
        assertTrue(slots.stream().anyMatch(slot -> slot.date().equals("2026-10-27") && slot.hour()==14));
    }
    @Test void exactWindowAndBeijingCurrentTimeAreHardConstraints() {
        var slots = RiskCalculator.calculateSlots(forecast(), input(2,"普通人群",14,16), clock);
        assertTrue(slots.stream().allMatch(slot -> slot.hour()==14));
        var evening = java.time.Clock.fixed(java.time.Instant.parse("2026-10-26T09:15:00Z"),java.time.ZoneOffset.UTC);
        var remaining = RiskCalculator.calculateSlots(forecast(),input(2,"普通人群",6,21),evening);
        assertTrue(remaining.stream().filter(slot->slot.date().equals("2026-10-26")).allMatch(slot->slot.hour()>=19));
        assertTrue(remaining.stream().anyMatch(slot->slot.date().equals("2026-10-27")&&slot.hour()==6));
    }
}
