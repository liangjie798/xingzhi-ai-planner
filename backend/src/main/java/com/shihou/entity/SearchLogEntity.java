package com.shihou.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "search_log")
public class SearchLogEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String queryText;
    private int resultCount;
    private String username;
    private String actorType;
    private Instant createdAt;

    protected SearchLogEntity() { }
    public SearchLogEntity(String queryText, int resultCount, String username, String actorType) {
        this.queryText = queryText; this.resultCount = resultCount; this.username = username;
        this.actorType = actorType; this.createdAt = Instant.now();
    }
    public Long getId() { return id; }
    public String getQueryText() { return queryText; }
    public int getResultCount() { return resultCount; }
    public String getUsername() { return username; }
    public String getActorType() { return actorType; }
    public Instant getCreatedAt() { return createdAt; }
}
