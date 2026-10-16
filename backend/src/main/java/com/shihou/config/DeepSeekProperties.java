package com.shihou.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "shihou.deepseek")
public record DeepSeekProperties(String apiKey, String baseUrl, String model) {
    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }
}

