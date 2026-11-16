package com.shihou.service;

import com.shihou.dao.CityEnvironmentRepository;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class QWeatherFallbackTests {
    private static final ZoneId CHINA = ZoneId.of("Asia/Shanghai");

    private static HttpResponse<String> response(String body) {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);
        return response;
    }

    private static String airFixture(LocalDate today) {
        var mapper = new ObjectMapper();
        List<String> times = new ArrayList<>();
        List<Integer> aqi = new ArrayList<>();
        List<Integer> pm = new ArrayList<>();
        for (int day = -1; day <= 7; day++) {
            for (int hour = 0; hour < 24; hour++) {
                times.add(today.plusDays(day) + "T" + String.format("%02d:00", hour));
                aqi.add(40);
                pm.add(10);
            }
        }
        Map<String, Object> hourly = new HashMap<>();
        hourly.put("time", times);
        hourly.put("us_aqi", aqi);
        hourly.put("pm2_5", pm);
        Map<String, Object> current = new HashMap<>();
        current.put("time", today + "T10:00");
        current.put("us_aqi", 40);
        current.put("pm2_5", 10);
        return mapper.writeValueAsString(Map.of("hourly", hourly, "current", current));
    }

    private static String qweatherFixture(LocalDate today, int startHour, int count) {
        var mapper = new ObjectMapper();
        List<Map<String, String>> rows = new ArrayList<>();
        LocalDateTime start = today.atTime(startHour, 0);
        for (int index = 0; index < count; index++) {
            String time = start.plusHours(index).toString() + "+08:00";
            rows.add(Map.of(
                    "fxTime", time,
                    "temp", String.valueOf(18 + index / 12),
                    "feelsLike", "18",
                    "humidity", "60",
                    "pop", "5",
                    "windSpeed", "10",
                    "text", "晴"));
        }
        return mapper.writeValueAsString(Map.of("code", "200", "hourly", rows));
    }

    private static HttpClient client(Clock clock, LocalDate today, String qweather, int qweatherRows) {
        HttpClient client = mock(HttpClient.class);
        when(client.sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenAnswer(call -> {
                    HttpRequest request = call.getArgument(0);
                    String host = request.uri().getHost();
                    String path = request.uri().getPath();
                    if (host.startsWith("api.open-meteo.com") && path.contains("forecast")) {
                        return CompletableFuture.<HttpResponse<String>>failedFuture(new RuntimeException("primary weather down"));
                    }
                    if (host.startsWith("air-quality-api.open-meteo.com")) {
                        return CompletableFuture.completedFuture(response(airFixture(today)));
                    }
                    if (host.startsWith("devapi.qweather.com") || host.startsWith("api.qweather.com")) {
                        return CompletableFuture.completedFuture(response(qweatherFixture(today, 11, qweatherRows)));
                    }
                    return CompletableFuture.<HttpResponse<String>>failedFuture(new RuntimeException("unexpected " + request.uri()));
                });
        return client;
    }

    @Test
    void weatherFallsBackToQWeatherAndKeepsPrimaryAirQuality() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-13T02:30:00Z"), ZoneId.of("UTC"));
        LocalDate today = LocalDate.now(clock.withZone(CHINA));
        var service = new EnvironmentService(mock(CityEnvironmentRepository.class), new ObjectMapper(),
                client(clock, today, "qweather", 24), clock, "test-key", "https://devapi.qweather.com", "24");
        var points = service.getForecast("hangzhou", today);
        assertEquals(13, points.size(), "备用源从 11:00 起覆盖，更早的小时不伪造");
        assertEquals(11, points.get(0).hour());
        assertEquals(18.0, points.get(0).temperature());
        assertEquals(5, points.get(0).rainProbability());
        assertFalse(points.get(0).airQualityReused());
        assertEquals("晴", service.getCity("hangzhou").getWeather(), "QWeather text is mapped to a WMO code");
    }

    @Test
    void fallbackDoesNotInventHoursBeyondItsWindow() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-13T02:30:00Z"), ZoneId.of("UTC"));
        LocalDate today = LocalDate.now(clock.withZone(CHINA));
        var service = new EnvironmentService(mock(CityEnvironmentRepository.class), new ObjectMapper(),
                client(clock, today, "qweather", 24), clock, "test-key", "https://devapi.qweather.com", "24");
        assertThrows(IllegalArgumentException.class, () -> service.getForecast("hangzhou", today.plusDays(1)));
    }

    @Test
    void withoutQWeatherKeyPrimaryFailureStaysVisible() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-13T02:30:00Z"), ZoneId.of("UTC"));
        LocalDate today = LocalDate.now(clock.withZone(CHINA));
        var service = new EnvironmentService(mock(CityEnvironmentRepository.class), new ObjectMapper(),
                client(clock, today, "qweather", 24), clock, "", "https://devapi.qweather.com", "24");
        assertThrows(EnvironmentService.LiveDataUnavailableException.class, () -> service.getForecast("hangzhou", today));
    }

    @Test
    void emptyQWeatherHourlyKeepsPrimaryFailureVisible() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-13T02:30:00Z"), ZoneId.of("UTC"));
        LocalDate today = LocalDate.now(clock.withZone(CHINA));
        var service = new EnvironmentService(mock(CityEnvironmentRepository.class), new ObjectMapper(),
                client(clock, today, "missing", 0), clock, "test-key", "https://devapi.qweather.com", "24");
        assertThrows(EnvironmentService.LiveDataUnavailableException.class, () -> service.getForecast("hangzhou", today));
    }
}
