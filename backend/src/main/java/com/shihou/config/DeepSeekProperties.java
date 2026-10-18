package com.shihou.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "shihou.deepseek")
public record DeepSeekProperties(String apiKey, String baseUrl, String model,
                                 String fallbackBaseUrl, String fallbackModel) {
    public boolean configured() {
        return primaryConfigured() || (fallbackBaseUrl != null && !fallbackBaseUrl.isBlank());
    }

    public boolean primaryConfigured() { return apiKey != null && !apiKey.isBlank(); }
    public String activeBaseUrl() { return primaryConfigured() ? baseUrl : fallbackBaseUrl; }
    public String activeModel() { return primaryConfigured() ? model : fallbackModel; }
    public String activeApiKey() { return primaryConfigured() ? apiKey : ""; }
    public String activeProvider() { return primaryConfigured() ? "DeepSeek" : "Pollinations开源模型"; }
}

