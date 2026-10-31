package com.shihou.service;

import com.shihou.dao.CityEnvironmentRepository;
import com.shihou.dto.EnvironmentalForecastPoint;
import com.shihou.dto.CitySearchResult;
import com.shihou.entity.CityEnvironmentEntity;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Clock;
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
    private final Clock clock;
    private final Map<String, CachedForecast> cache = new ConcurrentHashMap<>();
    private final Map<String, CachedSources> sourceCache = new ConcurrentHashMap<>();
    private final Map<String, Object> sourceLocks = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public EnvironmentService(CityEnvironmentRepository repository, ObjectMapper objectMapper) {
        this(repository, objectMapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8))
                .followRedirects(HttpClient.Redirect.NORMAL).build(), Clock.system(CHINA_ZONE));
    }

    EnvironmentService(CityEnvironmentRepository repository, ObjectMapper objectMapper, HttpClient httpClient, Clock clock) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.clock = clock.withZone(CHINA_ZONE);
    }

    public List<CityEnvironmentEntity> listCities() {
        return CITIES.stream().map(city -> getCity(city.id())).toList();
    }

    public CityEnvironmentEntity getCity(String cityId) {
        return forecast(cityId, LocalDate.now(clock)).city();
    }

    public CityEnvironmentEntity getCity(String cityId, String name, String province, String adcode,
                                         double longitude, double latitude) {
        return forecast(customDefinition(cityId, name, province, adcode, longitude, latitude),
                LocalDate.now(clock), false).city();
    }

    public List<EnvironmentalForecastPoint> getForecast(String cityId, LocalDate date) {
        validateForecastDate(date);
        return forecast(cityId, date).points();
    }

    public List<EnvironmentalForecastPoint> getForecast(String cityId, String name, String province, String adcode,
                                                        double longitude, double latitude, LocalDate date) {
        validateForecastDate(date);
        return forecast(customDefinition(cityId, name, province, adcode, longitude, latitude), date, false).points();
    }

    public List<CitySearchResult> searchCities(String query) {
        String cleaned = query == null ? "" : query.strip();
        if (cleaned.length() < 2 || cleaned.length() > 40) {
            throw new IllegalArgumentException("请输入2至40个字符的城市名称");
        }
        String url = "https://geocoding-api.open-meteo.com/v1/search?name="
                + URLEncoder.encode(cleaned, StandardCharsets.UTF_8)
                + "&count=8&language=zh&format=json&countryCode=CN";
        try {
            JsonNode results = fetchJson(url).join().path("results");
            List<CitySearchResult> matches = new ArrayList<>();
            for (JsonNode result : results) {
                if (!result.path("latitude").isNumber() || !result.path("longitude").isNumber()) continue;
                String sourceId = result.path("id").asText();
                String province = result.path("admin1").asText("中国");
                String district = result.path("admin2").asText("");
                matches.add(new CitySearchResult(
                        "geo-" + sourceId,
                        result.path("name").asText(cleaned),
                        province,
                        district,
                        "geo-" + sourceId,
                        result.path("longitude").asDouble(),
                        result.path("latitude").asDouble()
                ));
            }
            return List.copyOf(matches);
        } catch (RuntimeException exception) {
            throw new LiveDataUnavailableException("城市检索服务暂时不可用，请稍后重试", exception);
        }
    }

    private ForecastBundle forecast(String cityId, LocalDate date) {
        CityDefinition definition = CITIES.stream()
                .filter(city -> city.id().equals(cityId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("暂不支持该城市: " + cityId));
        return forecast(definition, date, true);
    }

    private ForecastBundle forecast(CityDefinition definition, LocalDate date, boolean persistSnapshot) {
        LocalDate today = LocalDate.now(clock);
        cache.entrySet().removeIf(entry -> !entry.getValue().fetchedAt().atZone(CHINA_ZONE).toLocalDate().equals(today));
        String cacheKey = definition.id() + ":" + definition.latitude() + ":" + definition.longitude() + ":" + date + ":" + today;
        CachedForecast cached = cache.get(cacheKey);
        if (cached != null && cached.fetchedAt().plus(CACHE_TTL).isAfter(clock.instant())) {
            return cached.bundle();
        }

        try {
            ForecastBundle bundle = fetchForecast(definition, date);
            // 搜索得到的区县和地图网格点属于临时计算坐标，多个采样点可能共享同一行政区代码。
            // 只持久化内置城市中心快照，避免临时坐标争用 adcode 唯一键并让实时请求返回 503。
            if (persistSnapshot) repository.save(bundle.city());
            cache.put(cacheKey, new CachedForecast(bundle, clock.instant()));
            return bundle;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new LiveDataUnavailableException("实时环境数据源暂时不可用，请稍后重试", exception);
        }
    }

    private CityDefinition customDefinition(String cityId, String name, String province, String adcode,
                                            double longitude, double latitude) {
        if (!Double.isFinite(longitude) || !Double.isFinite(latitude)
                || longitude < 73 || longitude > 136 || latitude < 3 || latitude > 54) {
            throw new IllegalArgumentException("城市坐标不在中国大陆服务范围内");
        }
        String safeId = cityId == null || cityId.isBlank()
                ? "geo-" + Integer.toUnsignedString((name + longitude + latitude).hashCode()) : cityId;
        String safeName = name == null || name.isBlank() ? "所选城市" : name.strip();
        String safeProvince = province == null || province.isBlank() ? "中国" : province.strip();
        String safeAdcode = adcode == null || adcode.isBlank() ? safeId : adcode;
        return new CityDefinition(safeId, safeName, safeProvince, safeAdcode, longitude, latitude);
    }

    private ForecastBundle fetchForecast(CityDefinition city, LocalDate date) {
        CachedSources sources = fetchSources(city);
        JsonNode weather = sources.weather();
        JsonNode air = sources.air();

        JsonNode currentWeather = weather.path("current");
        JsonNode currentAir = air.path("current");
        String currentTime = currentWeather.path("time").asText();
        double temperature = boundedDouble(currentWeather, "temperature_2m", -90, 60);
        int humidity = boundedInt(currentWeather, "relative_humidity_2m", 0, 100);
        double apparent = boundedDouble(currentWeather, "apparent_temperature", -100, 70);
        int aqi = boundedInt(currentAir, "us_aqi", 0, 500);
        int pm25 = (int) Math.round(boundedDouble(currentAir, "pm2_5", 0, 2000));
        String currentHour = currentTime.substring(0, 13) + ":00";
        int rain = hourlyIntAt(weather.path("hourly"), "precipitation_probability", currentHour, 0, 100);
        int weatherCode = boundedInt(currentWeather, "weather_code", 0, 99);
        double windSpeed = boundedDouble(currentWeather, "wind_speed_10m", 0, 500);
        Instant observedAt = LocalDateTime.parse(currentTime).atZone(CHINA_ZONE).toInstant();

        CityEnvironmentEntity snapshot = new CityEnvironmentEntity(
                city.id(), city.name(), city.province(), city.adcode(), city.longitude(), city.latitude(),
                weatherName(weatherCode), round1(temperature), humidity, beaufort(windSpeed), rain,
                aqi, pm25, heatRisk(temperature, humidity, apparent), observedAt, "live"
        );

        JsonNode weatherHourly = weather.path("hourly");
        JsonNode airHourly = air.path("hourly");
        List<EnvironmentalForecastPoint> points = new ArrayList<>();
        for (int hour = 0; hour <= 23; hour++) {
            String time = date + "T" + "%02d:00".formatted(hour);
            int weatherIndex = indexOf(weatherHourly.path("time"), time);
            int airIndex = indexOf(airHourly.path("time"), time);
            if (weatherIndex < 0) {
                throw new IllegalArgumentException("所选日期超出逐小时预报范围");
            }
            // 空气质量接口最多提供 7 个自然日。第 8 天使用最近一天相同小时的值，
            // 使“从明天起未来七天”的路线仍可获得保守的空气风险估计。
            if (airIndex < 0) {
                int airCount = airHourly.path("time").size();
                if (airCount < 24) throw new IllegalStateException("空气质量逐小时数据不足");
                airIndex = airCount - 24 + hour;
            }
            while (airIndex >= 0 && (!airHourly.path("us_aqi").path(airIndex).isNumber()
                    || !airHourly.path("pm2_5").path(airIndex).isNumber())) {
                airIndex -= 24;
            }
            if (airIndex < 0) throw new IllegalStateException("缺少可用的空气质量逐小时数据");
            double hourlyTemperature = boundedArrayDouble(weatherHourly, "temperature_2m", weatherIndex, -90, 60);
            int hourlyHumidity = boundedArrayInt(weatherHourly, "relative_humidity_2m", weatherIndex, 0, 100);
            double hourlyApparent = boundedArrayDouble(weatherHourly, "apparent_temperature", weatherIndex, -100, 70);
            String airSourceTime = airHourly.path("time").path(airIndex).asText("");
            if (airSourceTime.length() < 10) throw new IllegalStateException("缺少空气质量数据时间");
            String airSourceDate = airSourceTime.substring(0, 10);
            boolean airQualityReused = !time.equals(airSourceTime);
            points.add(new EnvironmentalForecastPoint(
                    date.toString(), hour, round1(hourlyTemperature), hourlyHumidity,
                    boundedArrayInt(weatherHourly, "precipitation_probability", weatherIndex, 0, 100),
                    boundedArrayInt(airHourly, "us_aqi", airIndex, 0, 500),
                    (int) Math.round(boundedArrayDouble(airHourly, "pm2_5", airIndex, 0, 2000)),
                    heatRisk(hourlyTemperature, hourlyHumidity, hourlyApparent),
                    airQualityReused, airSourceDate
            ));
        }
        return new ForecastBundle(snapshot, List.copyOf(points));
    }

    private CachedSources fetchSources(CityDefinition city) {
        LocalDate today = LocalDate.now(clock);
        sourceCache.entrySet().removeIf(entry -> !entry.getValue().fetchedAt().atZone(CHINA_ZONE).toLocalDate().equals(today));
        String sourceKey = city.latitude() + ":" + city.longitude() + ":" + today;
        CachedSources cached = sourceCache.get(sourceKey);
        if (cached != null && cached.fetchedAt().plus(CACHE_TTL).isAfter(clock.instant())) return cached;
        Object lock = sourceLocks.computeIfAbsent(sourceKey, ignored -> new Object());
        synchronized (lock) {
            cached = sourceCache.get(sourceKey);
            if (cached != null && cached.fetchedAt().plus(CACHE_TTL).isAfter(clock.instant())) return cached;
        String coordinate = "latitude=" + city.latitude() + "&longitude=" + city.longitude();
        String weatherUrl = "https://api.open-meteo.com/v1/forecast?" + coordinate
                + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
                + "&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m"
                // Keep yesterday's last hour for current observations lagging across midnight.
                + "&timezone=Asia%2FShanghai&start_date=" + today.minusDays(1) + "&end_date=" + today.plusDays(7);
        String airUrl = "https://air-quality-api.open-meteo.com/v1/air-quality?" + coordinate
                + "&current=pm2_5,us_aqi&hourly=pm2_5,us_aqi&timezone=Asia%2FShanghai&forecast_days=7";

            try {
                CompletableFuture<JsonNode> weatherFuture = fetchJson(weatherUrl);
                CompletableFuture<JsonNode> airFuture = fetchJson(airUrl);
                CachedSources loaded = new CachedSources(weatherFuture.join(), airFuture.join(), clock.instant());
                sourceCache.put(sourceKey, loaded);
                return loaded;
            } catch (RuntimeException exception) {
                if (cached != null) return cached;
                throw exception;
            }
        }
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
        LocalDate today = LocalDate.now(clock);
        if (date.isBefore(today) || date.isAfter(today.plusDays(7))) {
            throw new IllegalArgumentException("活动日期仅支持今天至未来7天");
        }
    }

    private int hourlyIntAt(JsonNode hourly, String field, String time, int min, int max) {
        int index = indexOf(hourly.path("time"), time);
        if (index < 0) throw new IllegalStateException("缺少当前小时数据");
        return boundedArrayInt(hourly, field, index, min, max);
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

    private double boundedDouble(JsonNode node, String field, double min, double max) {
        double value = requiredDouble(node, field);
        if (!Double.isFinite(value) || value < min || value > max) throw new IllegalStateException("字段超出合理范围 " + field);
        return value;
    }

    private int boundedInt(JsonNode node, String field, int min, int max) {
        int value = requiredInt(node, field);
        if (value < min || value > max) throw new IllegalStateException("字段超出合理范围 " + field);
        return value;
    }

    private double arrayDouble(JsonNode node, String field, int index) {
        JsonNode value = node.path(field).path(index);
        if (!value.isNumber()) throw new IllegalStateException("缺少逐小时字段 " + field);
        return value.asDouble();
    }

    private int arrayInt(JsonNode node, String field, int index) {
        return (int) Math.round(arrayDouble(node, field, index));
    }

    private double boundedArrayDouble(JsonNode node, String field, int index, double min, double max) {
        double value = arrayDouble(node, field, index);
        if (!Double.isFinite(value) || value < min || value > max) throw new IllegalStateException("逐小时字段超出合理范围 " + field);
        return value;
    }

    private int boundedArrayInt(JsonNode node, String field, int index, int min, int max) {
        int value = arrayInt(node, field, index);
        if (value < min || value > max) throw new IllegalStateException("逐小时字段超出合理范围 " + field);
        return value;
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
    private record CachedSources(JsonNode weather, JsonNode air, Instant fetchedAt) { }

    public static final class LiveDataUnavailableException extends RuntimeException {
        public LiveDataUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
