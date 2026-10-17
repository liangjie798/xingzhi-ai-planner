package com.shihou.service;

import com.shihou.dao.CityEnvironmentRepository;
import com.shihou.dto.EnvironmentalForecastPoint;
import com.shihou.entity.CityEnvironmentEntity;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class EnvironmentService {
    private static final ZoneId CHINA_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final List<CityDefinition> CITIES = List.of(
            new CityDefinition("beijing", "北京市", "北京市", "110000", 116.397428, 39.90923),
            new CityDefinition("shanghai", "上海市", "上海市", "310000", 121.473701, 31.230416),
            new CityDefinition("guangzhou", "广州市", "广东省", "440100", 113.264385, 23.129112),
            new CityDefinition("shenzhen", "深圳市", "广东省", "440300", 114.057868, 22.543099),
            new CityDefinition("hangzhou", "杭州市", "浙江省", "330100", 120.15507, 30.274085),
            new CityDefinition("chengdu", "成都市", "四川省", "510100", 104.066541, 30.572269),
            new CityDefinition("wuhan", "武汉市", "湖北省", "420100", 114.305393, 30.593099),
            new CityDefinition("nanjing", "南京市", "江苏省", "320100", 118.796877, 32.060255),
            new CityDefinition("xian", "西安市", "陕西省", "610100", 108.93977, 34.341574)
    );

    private final CityEnvironmentRepository repository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Map<String, CachedForecast> cache = new ConcurrentHashMap<>();

    public EnvironmentService(CityEnvironmentRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public List<CityEnvironmentEntity> listCities() {
        return CITIES.stream().map(city -> getCity(city.id())).toList();
    }

    public CityEnvironmentEntity getCity(String cityId) {
        return forecast(cityId, LocalDate.now(CHINA_ZONE)).city();
    }

    public List<EnvironmentalForecastPoint> getForecast(String cityId, LocalDate date) {
        validateForecastDate(date);
        return forecast(cityId, date).points();
    }

    private ForecastBundle forecast(String cityId, LocalDate date) {
        CityDefinition definition = CITIES.stream()
                .filter(city -> city.id().equals(cityId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("暂不支持该城市: " + cityId));
        String cacheKey = cityId + ":" + date;
        CachedForecast cached = cache.get(cacheKey);
        if (cached != null && cached.fetchedAt().plus(CACHE_TTL).isAfter(Instant.now())) {
            return cached.bundle();
        }

        try {
            ForecastBundle bundle = fetchForecast(definition, date);
            repository.save(bundle.city());
            cache.put(cacheKey, new CachedForecast(bundle, Instant.now()));
            return bundle;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new LiveDataUnavailableException("实时环境数据源暂时不可用，请稍后重试", exception);
        }
    }

    private ForecastBundle fetchForecast(CityDefinition city, LocalDate date) {
        String coordinate = "latitude=" + city.latitude() + "&longitude=" + city.longitude();
        String weatherUrl = "https://api.open-meteo.com/v1/forecast?" + coordinate
                + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
                + "&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m"
                + "&timezone=Asia%2FShanghai&forecast_days=5";
        String airUrl = "https://air-quality-api.open-meteo.com/v1/air-quality?" + coordinate
                + "&current=pm2_5,us_aqi&hourly=pm2_5,us_aqi&timezone=Asia%2FShanghai&forecast_days=5";

        CompletableFuture<JsonNode> weatherFuture = fetchJson(weatherUrl);
        CompletableFuture<JsonNode> airFuture = fetchJson(airUrl);
        JsonNode weather = weatherFuture.join();
        JsonNode air = airFuture.join();

        JsonNode currentWeather = weather.path("current");
        JsonNode currentAir = air.path("current");
        String currentTime = currentWeather.path("time").asText();
        double temperature = requiredDouble(currentWeather, "temperature_2m");
        int humidity = requiredInt(currentWeather, "relative_humidity_2m");
        double apparent = requiredDouble(currentWeather, "apparent_temperature");
        int aqi = requiredInt(currentAir, "us_aqi");
        int pm25 = (int) Math.round(requiredDouble(currentAir, "pm2_5"));
        int rain = hourlyIntAt(weather.path("hourly"), "precipitation_probability", currentTime);
        int weatherCode = requiredInt(currentWeather, "weather_code");
        double windSpeed = requiredDouble(currentWeather, "wind_speed_10m");
        Instant observedAt = LocalDateTime.parse(currentTime).atZone(CHINA_ZONE).toInstant();

        CityEnvironmentEntity snapshot = new CityEnvironmentEntity(
                city.id(), city.name(), city.province(), city.adcode(), city.longitude(), city.latitude(),
                weatherName(weatherCode), round1(temperature), humidity, beaufort(windSpeed), rain,
                aqi, pm25, heatRisk(temperature, humidity, apparent), observedAt, "live"
        );

        JsonNode weatherHourly = weather.path("hourly");
        JsonNode airHourly = air.path("hourly");
        List<EnvironmentalForecastPoint> points = new ArrayList<>();
        for (int hour = 6; hour <= 20; hour++) {
            String time = date + "T" + "%02d:00".formatted(hour);
            int weatherIndex = indexOf(weatherHourly.path("time"), time);
            int airIndex = indexOf(airHourly.path("time"), time);
            if (weatherIndex < 0 || airIndex < 0) {
                throw new IllegalArgumentException("所选日期超出逐小时预报范围");
            }
            double hourlyTemperature = arrayDouble(weatherHourly, "temperature_2m", weatherIndex);
            int hourlyHumidity = arrayInt(weatherHourly, "relative_humidity_2m", weatherIndex);
            double hourlyApparent = arrayDouble(weatherHourly, "apparent_temperature", weatherIndex);
            points.add(new EnvironmentalForecastPoint(
                    hour,
                    round1(hourlyTemperature),
                    hourlyHumidity,
                    arrayInt(weatherHourly, "precipitation_probability", weatherIndex),
                    arrayInt(airHourly, "us_aqi", airIndex),
                    (int) Math.round(arrayDouble(airHourly, "pm2_5", airIndex)),
                    heatRisk(hourlyTemperature, hourlyHumidity, hourlyApparent)
            ));
        }
        return new ForecastBundle(snapshot, List.copyOf(points));
    }

    private CompletableFuture<JsonNode> fetchJson(String url) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(12))
                .header("User-Agent", "Shihou/1.0 lht574.cn")
                .GET()
                .build();
        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(response -> {
                    if (response.statusCode() < 200 || response.statusCode() >= 300) {
                        throw new IllegalStateException("环境数据源返回状态码 " + response.statusCode());
                    }
                    return objectMapper.readTree(response.body());
                });
    }

    private void validateForecastDate(LocalDate date) {
        LocalDate today = LocalDate.now(CHINA_ZONE);
        if (date.isBefore(today) || date.isAfter(today.plusDays(4))) {
            throw new IllegalArgumentException("活动日期仅支持今天至未来4天");
        }
    }

    private int hourlyIntAt(JsonNode hourly, String field, String time) {
        int index = indexOf(hourly.path("time"), time);
        if (index < 0) throw new IllegalStateException("缺少当前小时数据");
        return arrayInt(hourly, field, index);
    }

    private int indexOf(JsonNode array, String value) {
        for (int index = 0; index < array.size(); index++) {
            if (value.equals(array.get(index).asText())) return index;
        }
        return -1;
    }

    private double requiredDouble(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isNumber()) throw new IllegalStateException("缺少字段 " + field);
        return value.asDouble();
    }

    private int requiredInt(JsonNode node, String field) {
        return (int) Math.round(requiredDouble(node, field));
    }

    private double arrayDouble(JsonNode node, String field, int index) {
        JsonNode value = node.path(field).path(index);
        if (!value.isNumber()) throw new IllegalStateException("缺少逐小时字段 " + field);
        return value.asDouble();
    }

    private int arrayInt(JsonNode node, String field, int index) {
        return (int) Math.round(arrayDouble(node, field, index));
    }

    private int heatRisk(double temperature, int humidity, double apparentTemperature) {
        double heatComponent = Math.max(0, apparentTemperature - 20) * 4.2;
        double humidityComponent = Math.max(0, humidity - 55) * 0.35;
        double coldComponent = Math.max(0, 8 - temperature) * 3.0;
        return (int) Math.round(Math.min(100, heatComponent + humidityComponent + coldComponent));
    }

    private int beaufort(double kilometersPerHour) {
        double[] thresholds = {1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118};
        for (int level = 0; level < thresholds.length; level++) {
            if (kilometersPerHour < thresholds[level]) return level;
        }
        return 12;
    }

    private String weatherName(int code) {
        return switch (code) {
            case 0 -> "晴";
            case 1 -> "大部晴朗";
            case 2 -> "局部多云";
            case 3 -> "阴";
            case 45, 48 -> "雾";
            case 51, 53, 55 -> "毛毛雨";
            case 56, 57, 66, 67 -> "冻雨";
            case 61, 63, 65 -> "降雨";
            case 71, 73, 75, 77 -> "降雪";
            case 80, 81, 82 -> "阵雨";
            case 85, 86 -> "阵雪";
            case 95, 96, 99 -> "雷暴";
            default -> "天气变化";
        };
    }

    private double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private record CityDefinition(String id, String name, String province, String adcode,
                                  double longitude, double latitude) { }
    private record ForecastBundle(CityEnvironmentEntity city, List<EnvironmentalForecastPoint> points) { }
    private record CachedForecast(ForecastBundle bundle, Instant fetchedAt) { }

    public static final class LiveDataUnavailableException extends RuntimeException {
        public LiveDataUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
