package com.shihou.dto;

import java.util.List;

public record ActivityDecisionResponse(
        String recommendation,
        String summary,
        int overallScore,
        String overallLevel,
        TimeSlotScore bestSlot,
        List<TimeSlotScore> slots,
        List<String> actions,
        String contingency,
        List<EvidenceItem> evidence,
        List<ToolTraceItem> trace,
        String generatedBy,
        String modelProvider,
        double confidence,
        String ragMode,
        List<String> agentPlan
) {
}

