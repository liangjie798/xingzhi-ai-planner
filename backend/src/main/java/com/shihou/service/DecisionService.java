package com.shihou.service;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.shihou.dao.DecisionRecordRepository;
import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.ActivityDecisionResponse;
import com.shihou.dto.EvidenceItem;
import com.shihou.dto.TimeSlotScore;
import com.shihou.dto.ToolTraceItem;
import com.shihou.entity.CityEnvironmentEntity;
import com.shihou.entity.DecisionRecordEntity;
import com.shihou.utils.RiskCalculator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.time.LocalDate;
import java.util.concurrent.TimeUnit;

@Service
public class DecisionService {
    private final EnvironmentService environmentService;
    private final PolicyRagService policyRagService;
    private final DeepSeekService deepSeekService;
    private final DecisionRecordRepository decisionRecordRepository;
    private final ObjectMapper objectMapper;

    public DecisionService(EnvironmentService environmentService, PolicyRagService policyRagService,
                           DeepSeekService deepSeekService, DecisionRecordRepository decisionRecordRepository,
                           ObjectMapper objectMapper) {
        this.environmentService = environmentService;
        this.policyRagService = policyRagService;
        this.deepSeekService = deepSeekService;
        this.decisionRecordRepository = decisionRecordRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ActivityDecisionResponse analyze(ActivityDecisionRequest request) {
        long stepStarted = System.nanoTime();
        CityEnvironmentEntity city = environmentService.getCity(request.cityId());
        var forecast = environmentService.getForecast(request.cityId(), LocalDate.parse(request.date()));
        int environmentMs = elapsedMillis(stepStarted);

        stepStarted = System.nanoTime();
        List<EvidenceItem> evidence = policyRagService.retrieve(request.activityType(), request.group());
        int evidenceMs = elapsedMillis(stepStarted);

        stepStarted = System.nanoTime();
        List<TimeSlotScore> slots = RiskCalculator.calculateSlots(forecast, request);
        int riskMs = elapsedMillis(stepStarted);

        stepStarted = System.nanoTime();
        TimeSlotScore best = RiskCalculator.bestSlot(slots);
        int comparisonMs = elapsedMillis(stepStarted);
        List<String> actions = buildActions(best);
        String fallbackSummary = "%s%s。基于逐小时天气、US AQI、降水概率、%s和%s活动约束，%s的活动适宜度最高。数据更新时间为%s。"
                .formatted(city.getName(), city.getWeather(), request.group(), request.intensity(), best.label(), city.getUpdatedAt());
        stepStarted = System.nanoTime();
        String summary = deepSeekService.explain(request, best, actions, evidence).orElse(fallbackSummary);
        int explanationMs = elapsedMillis(stepStarted);
        String generatedBy = summary.equals(fallbackSummary) ? "deterministic-fallback" : "deepseek";
        String recommendation = best.hour() == request.startHour()
                ? best.label() + " 可作为当前优先时段"
                : "建议将" + request.activityType() + "调整至 " + best.label() + " 开始";
        List<ToolTraceItem> trace = List.of(
                new ToolTraceItem("t1", "get_live_environment", "读取" + city.getName() + "实时环境与逐小时预报", "done", environmentMs),
                new ToolTraceItem("t2", "retrieve_policy_evidence", "读取内置环境与活动规则依据", "done", evidenceMs),
                new ToolTraceItem("t3", "calculate_activity_risk", "计算15个候选时段的复合风险", "done", riskMs),
                new ToolTraceItem("t4", "compare_candidate_slots", "选择" + best.label() + "为综合最优时段", "done", comparisonMs),
                new ToolTraceItem("t5", "generate_explanation", generatedBy.equals("deepseek") ? "DeepSeek生成解释" : "使用规则解释兜底", generatedBy.equals("deepseek") ? "done" : "fallback", explanationMs)
        );
        ActivityDecisionResponse response = new ActivityDecisionResponse(
                recommendation, summary,
                best.score(), best.level(), best, slots, actions,
                "当AQI超过100、热风险进入高等级或降水概率超过60%时，建议转入室内；无法转场时应缩短活动并降低强度。",
                evidence, trace, generatedBy
        );
        decisionRecordRepository.save(new DecisionRecordEntity(request.cityId(), request.activityType(),
                best.score(), best.level(), generatedBy, toJson(request), summary));
        return response;
    }

    private int elapsedMillis(long startedAt) {
        return (int) TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
    }

    private List<String> buildActions(TimeSlotScore slot) {
        return List.of(
                slot.heatRisk() >= 58 ? "设置补水点与遮阴休息区，每30分钟安排一次休息" : "保留常规补水与休息安排",
                slot.aqi() >= 80 ? "减少持续耐力项目，并关注敏感参与者状态" : "空气条件允许开展常规户外项目",
                slot.rainProbability() >= 40 ? "提前确认室内场地并设置降雨触发条件" : "保留场地防滑与短时降雨检查"
        );
    }

    private String toJson(ActivityDecisionRequest request) {
        try {
            return objectMapper.writeValueAsString(request);
        } catch (JacksonException exception) {
            return "{}";
        }
    }
}

