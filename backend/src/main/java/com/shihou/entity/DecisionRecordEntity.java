package com.shihou.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "decision_record")
public class DecisionRecordEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String cityId;
    private String activityType;
    private int overallScore;
    private String overallLevel;
    private String generatedBy;
    private String createdBy;
    @Lob
    private String requestPayload;
    @Lob
    private String resultSummary;
    private Instant createdAt;

    protected DecisionRecordEntity() {
    }

    public DecisionRecordEntity(String cityId, String activityType, int overallScore, String overallLevel,
                                String generatedBy, String requestPayload, String resultSummary, String createdBy) {
        this.cityId = cityId;
        this.activityType = activityType;
        this.overallScore = overallScore;
        this.overallLevel = overallLevel;
        this.generatedBy = generatedBy;
        this.createdBy = createdBy;
        this.requestPayload = requestPayload;
        this.resultSummary = resultSummary;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getCityId() { return cityId; }
    public String getActivityType() { return activityType; }
    public int getOverallScore() { return overallScore; }
    public String getOverallLevel() { return overallLevel; }
    public String getGeneratedBy() { return generatedBy; }
    public String getResultSummary() { return resultSummary; }
    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
}

