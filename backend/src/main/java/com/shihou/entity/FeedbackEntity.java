package com.shihou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "user_feedback")
public class FeedbackEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String username;
    private String actorType;
    @Column(length = 120) private String title;
    @Column(length = 4000) private String content;
    @Column(length = 40) private String status;
    @Column(length = 2000) private String adminReply;
    private Instant createdAt;
    private Instant updatedAt;

    protected FeedbackEntity() { }
    public FeedbackEntity(String username, String actorType, String title, String content) {
        this.username = username; this.actorType = actorType; this.title = title; this.content = content;
        this.status = "OPEN"; this.createdAt = Instant.now(); this.updatedAt = this.createdAt;
    }
    public void update(String status, String reply) {
        if (status != null) this.status = status;
        if (reply != null) this.adminReply = reply.trim();
        this.updatedAt = Instant.now();
    }
    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getActorType() { return actorType; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public String getStatus() { return status; }
    public String getAdminReply() { return adminReply; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
