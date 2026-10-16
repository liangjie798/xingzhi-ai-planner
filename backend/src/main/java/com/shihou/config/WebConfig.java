package com.shihou.config;

import com.shihou.interceptor.RequestTraceInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableConfigurationProperties(DeepSeekProperties.class)
public class WebConfig implements WebMvcConfigurer {
    private final RequestTraceInterceptor requestTraceInterceptor;
    private final String frontendOrigin;

    public WebConfig(
            RequestTraceInterceptor requestTraceInterceptor,
            @Value("${shihou.frontend-origin}") String frontendOrigin
    ) {
        this.requestTraceInterceptor = requestTraceInterceptor;
        this.frontendOrigin = frontendOrigin;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(requestTraceInterceptor).addPathPatterns("/api/**");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(frontendOrigin)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .maxAge(3600);
    }
}

