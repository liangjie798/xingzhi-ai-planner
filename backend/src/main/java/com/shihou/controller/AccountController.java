package com.shihou.controller;

import com.shihou.dao.DecisionRecordRepository;
import com.shihou.entity.DecisionRecordEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/v1/account")
public class AccountController {
    private final DecisionRecordRepository records;

    public AccountController(DecisionRecordRepository records) { this.records = records; }

    @GetMapping("/decisions")
    public List<DecisionHistoryItem> decisions(Principal principal) {
        return records.findTop50ByCreatedByOrderByCreatedAtDesc(principal.getName()).stream()
                .map(DecisionHistoryItem::from).toList();
    }

    public record DecisionHistoryItem(Long id, String cityId, String activityType, int overallScore,
                                      String overallLevel, String generatedBy, String summary, Instant createdAt) {
        static DecisionHistoryItem from(DecisionRecordEntity value) {
            return new DecisionHistoryItem(value.getId(), value.getCityId(), value.getActivityType(),
                    value.getOverallScore(), value.getOverallLevel(), value.getGeneratedBy(),
                    value.getResultSummary(), value.getCreatedAt());
        }
    }
}
