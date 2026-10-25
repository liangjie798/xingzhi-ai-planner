package com.shihou.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Column;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(name = "app_user", uniqueConstraints = @UniqueConstraint(columnNames = "username"))
public class UserEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String username;
    private String passwordHash;
    private String displayName;
    private String role;
    private boolean enabled;
    private Instant createdAt;
    private String modelProviderId;
    private String modelProviderLabel;
    @Column(length = 500)
    private String modelBaseUrl;
    private String modelName;
    @Column(length = 2000)
    private String modelApiKeyCiphertext;
    @jakarta.persistence.Lob @Column(columnDefinition = "MEDIUMTEXT")
    private String conversationMemory;

    protected UserEntity() { }

    public UserEntity(String username, String passwordHash, String displayName, String role) {
        this.username = username;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.role = role;
        this.enabled = true;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
    public String getRole() { return role; }
    public boolean isEnabled() { return enabled; }
    public Instant getCreatedAt() { return createdAt; }
    public String getModelProviderId() { return modelProviderId; }
    public String getModelProviderLabel() { return modelProviderLabel; }
    public String getModelBaseUrl() { return modelBaseUrl; }
    public String getModelName() { return modelName; }
    public String getModelApiKeyCiphertext() { return modelApiKeyCiphertext; }
    public String getConversationMemory() { return conversationMemory; }
    public void setConversationMemory(String value) { conversationMemory = value; }

    public void updateModelConfig(String providerId, String providerLabel, String baseUrl, String modelName, String apiKeyCiphertext) {
        this.modelProviderId = providerId;
        this.modelProviderLabel = providerLabel;
        this.modelBaseUrl = baseUrl;
        this.modelName = modelName;
        if (apiKeyCiphertext != null) this.modelApiKeyCiphertext = apiKeyCiphertext;
    }

    public void updateAdministrativeAccess(String nextPasswordHash, String nextDisplayName, String nextRole) {
        this.passwordHash = nextPasswordHash;
        this.displayName = nextDisplayName;
        this.role = nextRole;
        this.enabled = true;
    }

    public void updateByAdministrator(String nextDisplayName, Boolean nextEnabled, String nextPasswordHash) {
        if (nextDisplayName != null && !nextDisplayName.isBlank()) this.displayName = nextDisplayName.trim();
        if (nextEnabled != null) this.enabled = nextEnabled;
        if (nextPasswordHash != null && !nextPasswordHash.isBlank()) this.passwordHash = nextPasswordHash;
    }
}
