package com.shihou.controller;

import com.shihou.entity.UserEntity;
import com.shihou.service.UserModelConfigService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/account/model-config")
public class UserModelConfigController {
    private final UserModelConfigService configs;

    public UserModelConfigController(UserModelConfigService configs) { this.configs = configs; }

    @GetMapping
    public ConfigView read(Principal principal) { return view(configs.requireUser(principal.getName()), false); }

    @GetMapping("/resolve")
    public ConfigView resolve(Principal principal,
                              @RequestHeader(name = "X-Model-Resolver-Secret", required = false) String resolverSecret) {
        if (!configs.isTrustedResolver(resolverSecret)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return view(configs.requireUser(principal.getName()), true);
    }

    @PutMapping
    public ConfigView save(Principal principal, @Valid @RequestBody SaveConfig body) {
        if (!body.baseUrl().startsWith("https://")) throw new IllegalArgumentException("模型地址必须使用 HTTPS");
        UserEntity user = configs.save(principal.getName(), body.providerId(), body.providerLabel(), body.baseUrl(), body.model(), body.apiKey());
        return view(user, false);
    }

    private ConfigView view(UserEntity user, boolean includeSecret) {
        String apiKey = includeSecret ? configs.decryptApiKey(user) : "";
        boolean configured = user.getModelBaseUrl() != null && !user.getModelBaseUrl().isBlank();
        return new ConfigView(user.getModelProviderId(), user.getModelProviderLabel(), user.getModelBaseUrl(),
                user.getModelName(), apiKey, configured, user.getModelApiKeyCiphertext() != null);
    }

    public record SaveConfig(@NotBlank @Size(max = 40) String providerId,
                             @NotBlank @Size(max = 120) String providerLabel,
                             @NotBlank @Size(max = 500) String baseUrl,
                             @NotBlank @Size(max = 160) String model,
                             @Size(max = 500) String apiKey) { }
    public record ConfigView(String providerId, String providerLabel, String baseUrl, String model,
                             String apiKey, boolean configured, boolean hasApiKey) { }
}
