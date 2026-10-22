package com.shihou.service;

import com.shihou.dao.UserRepository;
import com.shihou.entity.UserEntity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.encrypt.Encryptors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Service
public class UserModelConfigService {
    private final UserRepository users;
    private final String secret;

    public UserModelConfigService(UserRepository users,
                                  @Value("${app.model-config.secret:local-development-model-config-secret}") String secret) {
        this.users = users;
        this.secret = secret;
    }

    public UserEntity requireUser(String username) {
        return users.findByUsername(username).orElseThrow(() -> new IllegalArgumentException("用户不存在"));
    }

    @Transactional
    public UserEntity save(String username, String providerId, String providerLabel, String baseUrl,
                           String model, String apiKey) {
        UserEntity user = requireUser(username);
        String encrypted = apiKey == null || apiKey.isBlank()
                ? user.getModelApiKeyCiphertext()
                : encrypt(username, apiKey.trim());
        user.updateModelConfig(providerId, providerLabel, baseUrl, model, encrypted);
        return users.save(user);
    }

    public String decryptApiKey(UserEntity user) {
        if (user.getModelApiKeyCiphertext() == null || user.getModelApiKeyCiphertext().isBlank()) return "";
        return Encryptors.text(secret, salt(user.getUsername())).decrypt(user.getModelApiKeyCiphertext());
    }

    public boolean isTrustedResolver(String candidate) {
        if (candidate == null || candidate.isBlank()) return false;
        return MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), candidate.getBytes(StandardCharsets.UTF_8));
    }

    private String encrypt(String username, String value) {
        return Encryptors.text(secret, salt(username)).encrypt(value);
    }

    private String salt(String username) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(username.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (Exception exception) {
            throw new IllegalStateException("无法初始化模型配置加密", exception);
        }
    }
}
