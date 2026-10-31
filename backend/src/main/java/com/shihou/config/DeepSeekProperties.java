package com.shihou.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "shihou.deepseek")
public record DeepSeekProperties(String apiKey, String baseUrl, String model,
                                 String fallbackBaseUrl, String fallbackModel) {
    public boolean configured() {
        return primaryConfigured();
    }

    public boolean primaryConfigured() { return apiKey != null && !apiKey.isBlank() && baseUrl != null && !baseUrl.isBlank() && model != null && !model.isBlank(); }
    public String activeBaseUrl() { return primaryConfigured() ? baseUrl : fallbackBaseUrl; }
    public String activeModel() { return primaryConfigured() ? model : fallbackModel; }
    public String activeApiKey() { return primaryConfigured() ? apiKey : ""; }
    public String activeProvider() { return primaryConfigured() ? (baseUrl.contains("api.deepseek.com") ? "DeepSeek" : "账户或服务端模型") : "未配置模型"; }
}

