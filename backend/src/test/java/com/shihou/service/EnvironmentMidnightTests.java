package com.shihou.service;

import com.shihou.dao.CityEnvironmentRepository;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class EnvironmentMidnightTests {
    static class MutableClock extends Clock {
        final AtomicReference<Instant> time;
        final ZoneId zone;
        MutableClock(AtomicReference<Instant> time, ZoneId zone) { this.time=time;this.zone=zone; }
        @Override public ZoneId getZone() { return zone; }
        @Override public Clock withZone(ZoneId zone) { return new MutableClock(time,zone); }
        @Override public Instant instant() { return time.get(); }
    }

    String fixture(boolean air, LocalDate today) {
        var mapper=new ObjectMapper();
        List<String> times=new ArrayList<>();
        for(int day=air?0:-1;day<(air?7:8);day++)for(int hour=0;hour<24;hour++)times.add(today.plusDays(day)+"T"+String.format("%02d:00",hour));
        Map<String,Object> hourly=new HashMap<>();hourly.put("time",times);
        Map<String,Object> current=new HashMap<>();current.put("time",today.minusDays(1)+"T23:45");
        Map<String,Number> values=air?Map.of("us_aqi",40,"pm2_5",10):Map.of("temperature_2m",20,"relative_humidity_2m",50,"apparent_temperature",20,"precipitation_probability",0,"weather_code",0,"wind_speed_10m",5);
        values.forEach((key,value)->{hourly.put(key,Collections.nCopies(times.size(),value));current.put(key,value);});
        return mapper.writeValueAsString(Map.of("hourly",hourly,"current",current));
    }

    @Test @SuppressWarnings("unchecked") void beijingMidnightRefreshesSourcesEvenWithinCacheTTL() {
        var instant=new AtomicReference<>(Instant.parse("2026-10-29T15:59:00Z"));
        var clock=new MutableClock(instant,ZoneOffset.UTC);
        var requests=new ArrayList<HttpRequest>();
        var client=mock(HttpClient.class);
        when(client.sendAsync(any(HttpRequest.class),org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenAnswer(call->{
            HttpRequest request=call.getArgument(0);requests.add(request);
            HttpResponse<String> response=mock(HttpResponse.class);
            when(response.statusCode()).thenReturn(200);
            when(response.body()).thenReturn(fixture(request.uri().getHost().startsWith("air-quality"),LocalDate.now(clock.withZone(ZoneId.of("Asia/Shanghai")))));
            return CompletableFuture.completedFuture(response);
        });
        var service=new EnvironmentService(mock(CityEnvironmentRepository.class),new ObjectMapper(),client,clock);
        assertEquals(24,service.getForecast("hangzhou",LocalDate.parse("2026-10-30")).size());
        assertEquals(24,service.getForecast("hangzhou",LocalDate.parse("2026-10-31")).size());
        assertEquals(2,requests.size(),"same-day dates should share source data");
        instant.set(Instant.parse("2026-10-29T16:01:00Z"));
        var points=service.getForecast("hangzhou",LocalDate.parse("2026-11-06"));
        assertEquals(24,points.size());assertEquals(4,requests.size(),"midnight must invalidate yesterday's source window");
        assertTrue(requests.stream().anyMatch(r->r.uri().getQuery().contains("start_date=2026-10-29&end_date=2026-11-06")));
        assertTrue(points.stream().allMatch(point->point.airQualityReused()&&point.airQualitySourceDate().equals("2026-11-05")));
    }

    @Test void unsupportedDatesAreRejectedBeforeProviderCalls() {
        var clock=Clock.fixed(Instant.parse("2026-10-29T16:01:00Z"),ZoneOffset.UTC);
        var client=mock(HttpClient.class);
        var service=new EnvironmentService(mock(CityEnvironmentRepository.class),new ObjectMapper(),client,clock);
        assertThrows(IllegalArgumentException.class,()->service.getForecast("hangzhou",LocalDate.parse("2026-10-29")));
        assertThrows(IllegalArgumentException.class,()->service.getForecast("hangzhou",LocalDate.parse("2026-11-07")));
        verifyNoInteractions(client);
    }
}
