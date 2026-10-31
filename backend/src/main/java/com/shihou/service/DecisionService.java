package com.shihou.service;

import com.shihou.dao.DecisionRecordRepository;
import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.ActivityDecisionResponse;
import com.shihou.dto.EnvironmentalForecastPoint;
import com.shihou.dto.EvidenceItem;
import com.shihou.dto.TimeSlotScore;
import com.shihou.dto.ToolTraceItem;
import com.shihou.entity.CityEnvironmentEntity;
import com.shihou.entity.DecisionRecordEntity;
import com.shihou.utils.RiskCalculator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Executes the bounded agent workflow and keeps deterministic scoring as a safety boundary. */
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
        return analyze(request, ignored -> { }, null);
    }

    public ActivityDecisionResponse analyze(ActivityDecisionRequest request, String username) {
        return analyze(request, ignored -> { }, username);
    }

    @Transactional
    public ActivityDecisionResponse analyze(ActivityDecisionRequest request, Consumer<ToolTraceItem> eventListener) {
        return analyze(request, eventListener, null);
    }

    @Transactional
    public ActivityDecisionResponse analyze(ActivityDecisionRequest request, Consumer<ToolTraceItem> eventListener, String username) {
        List<ToolTraceItem> trace = new ArrayList<>();

        long started = System.nanoTime();
        DeepSeekService.AgentPlan plan = deepSeekService.plan(request, username);
        emit(trace, eventListener, new ToolTraceItem("plan", "agent_plan",
                plan.rationale() + "；计划调用：" + String.join("、", plan.tools()),
                plan.modelPlanned() ? "done" : "fallback", elapsedMillis(started)));

        started = System.nanoTime();
        boolean customCity = request.longitude() != null && request.latitude() != null;
        CityEnvironmentEntity city = customCity
                ? environmentService.getCity(request.cityId(), request.cityName(), request.province(), request.adcode(), request.longitude(), request.latitude())
                : environmentService.getCity(request.cityId());
        LocalDate startDate = LocalDate.parse(request.date());
        LocalDate endDate = request.endDate() == null || request.endDate().isBlank()
                ? startDate : LocalDate.parse(request.endDate());
        if (endDate.isBefore(startDate) || endDate.isAfter(startDate.plusDays(6)))
            throw new IllegalArgumentException("结束日期应在开始日期至其后6天内");
        List<EnvironmentalForecastPoint> forecast = new ArrayList<>();
        for (LocalDate day = startDate; !day.isAfter(endDate); day = day.plusDays(1)) {
            forecast.addAll(customCity
                    ? environmentService.getForecast(request.cityId(), request.cityName(), request.province(), request.adcode(), request.longitude(), request.latitude(), day)
                    : environmentService.getForecast(request.cityId(), day));
        }
        emit(trace, eventListener, new ToolTraceItem("environment", "get_environment_window",
                "读取" + city.getName() + "共" + forecast.size() + "条真实逐小时预报", "done", elapsedMillis(started)));

        started = System.nanoTime();
        List<TimeSlotScore> slots = RiskCalculator.calculateSlots(forecast, request);
        if (slots.isEmpty()) throw new IllegalArgumentException("当前时段内没有覆盖完整活动和准备缓冲的未来窗口，请调整日期、缩短时长或扩大时段范围；不会推荐已过去的时间");
        TimeSlotScore best = RiskCalculator.bestSlot(slots);
        emit(trace, eventListener, new ToolTraceItem("score", "score_activity_slots",
                "按" + request.duration() + "小时完整窗口计算" + slots.size() + "个候选时段；气温取均值，热风险、AQI和降水取窗口最大值；已执行人群、强度及时段约束", "done", elapsedMillis(started)));

        started = System.nanoTime();
        List<String> riskKeywords = new ArrayList<>(riskKeywords(forecast, best));
        if (request.siteObservation() != null && !request.siteObservation().isBlank())
            riskKeywords.add("场地影像 " + request.siteObservation());
        List<EvidenceItem> evidence = policyRagService.retrieve(request.activityType(), request.group(),
                String.join(" ", safe(request.province()), safe(request.cityName())), riskKeywords, 5);
        emit(trace, eventListener, new ToolTraceItem("rag", "retrieve_policy_evidence",
                "以BM25＋本地中文向量＋RRF检索" + policyRagService.corpusSize() + "个权威片段，返回" + evidence.size() + "条可核验依据",
                "done", elapsedMillis(started)));

        started = System.nanoTime();
        List<String> deterministicActions = buildActions(best, request);
        String recommendation = best.hour() == request.startHour()
                ? best.label() + " 可作为当前优先时段"
                : "建议将" + request.activityType() + "调整至 " + best.label() + " 开始";
        emit(trace, eventListener, new ToolTraceItem("compare", "compare_activity_plans",
                "比较原定时段、最优时段与转场备用方案，选择" + best.label(), "done", elapsedMillis(started)));

        started = System.nanoTime();
        String contingency = buildContingency(best);
        emit(trace, eventListener, new ToolTraceItem("contingency", "build_contingency_plan",
                "生成AQI、热风险和降水触发条件", "done", elapsedMillis(started)));

        String dateScope = endDate.equals(startDate) ? startDate.toString() : startDate + " 至 " + endDate;
        String fallbackSummary = "%s%s。已比较%s内的逐小时环境、%s场景约束和权威安全依据，%s适宜度最高。建议按风险阈值保留转场方案，数据更新时间为%s。"
                .formatted(city.getName(), city.getWeather(), dateScope, request.activityType(), best.label(), city.getUpdatedAt());

        started = System.nanoTime();
        var narrative = deepSeekService.synthesize(request, best, deterministicActions, contingency, evidence, plan.tools(), username);
        String summary = narrative.map(DeepSeekService.AgentNarrative::summary).orElse(fallbackSummary);
        List<String> actions = deterministicActions;
        String finalContingency = contingency;
        double confidence = deterministicConfidence(evidence, forecast, narrative.isPresent());
        String generatedBy = narrative.map(value -> value.model().startsWith("DeepSeek")
                ? "deepseek-agent" : "open-model-agent").orElse("deterministic-agent-fallback");
        emit(trace, eventListener, new ToolTraceItem("synthesis", "synthesize_grounded_decision",
                narrative.isPresent() ? "DeepSeek基于工具结果和检索证据生成结构化方案" : "模型不可用，使用可解释规则方案",
                narrative.isPresent() ? "done" : "fallback", elapsedMillis(started)));

        started = System.nanoTime();
        boolean valid = validateDecision(best, slots, summary, evidence, forecast,
                narrative.map(DeepSeekService.AgentNarrative::citationIds).orElse(List.of()));
        if (!valid) {
            summary = fallbackSummary;
            actions = deterministicActions;
            finalContingency = contingency;
            confidence = deterministicConfidence(evidence, forecast, false);
            generatedBy = "validated-safety-fallback";
        }
        emit(trace, eventListener, new ToolTraceItem("verify", "verify_final_decision",
                valid ? "数值一致、引用均来自本次检索结果" : "发现不可靠输出，已切换安全兜底",
                valid ? "done" : "fallback", elapsedMillis(started)));

        ActivityDecisionResponse response = new ActivityDecisionResponse(
                recommendation, summary, best.score(), best.level(), best, slots, actions, finalContingency,
                evidence, List.copyOf(trace), generatedBy,
                narrative.isPresent() ? narrative.get().model() : plan.model(),
                confidence, policyRagService.mode(), plan.tools());
        decisionRecordRepository.save(new DecisionRecordEntity(request.cityId(), request.activityType(),
                best.score(), best.level(), generatedBy, toJson(request), summary, username));
        return response;
    }

    private double deterministicConfidence(List<EvidenceItem> evidence, List<EnvironmentalForecastPoint> forecast,
                                           boolean modelSucceeded) {
        double value = 0.62 + Math.min(0.15, evidence.size() * 0.025)
                + (forecast.size() >= 12 ? 0.08 : 0.03) + (modelSucceeded ? 0.04 : 0.0);
        return Math.round(Math.min(0.89, value) * 100.0) / 100.0;
    }

    private List<String> riskKeywords(List<EnvironmentalForecastPoint> forecast, TimeSlotScore best) {
        LinkedHashSet<String> risks = new LinkedHashSet<>();
        if (forecast.stream().anyMatch(point -> point.rainProbability() >= 40)) risks.add("降雨 防滑");
        if (forecast.stream().anyMatch(point -> point.heatRisk() >= 55)) risks.add("高温 高湿 中暑 补水");
        if (forecast.stream().anyMatch(point -> point.aqi() >= 80)) risks.add("空气质量 AQI 敏感人群");
        if (best.hour() >= 11 && best.hour() <= 15) risks.add("正午 户外暴露");
        if (risks.isEmpty()) risks.add("常规活动安全 应急预案");
        return List.copyOf(risks);
    }

    private boolean validateDecision(TimeSlotScore best, List<TimeSlotScore> slots, String summary,
                                     List<EvidenceItem> evidence, List<EnvironmentalForecastPoint> forecast,
                                     List<String> citationIds) {
        if (!slots.contains(best) || summary == null || summary.isBlank() || summary.length() > 1000) return false;
        var allowed = evidence.stream().map(EvidenceItem::id).collect(java.util.stream.Collectors.toSet());
        if (!allowed.containsAll(citationIds) || (summary.contains("[") && citationIds.isEmpty())) return false;
        int maxRain = forecast.stream().mapToInt(EnvironmentalForecastPoint::rainProbability).max().orElse(0);
        int maxHeat = forecast.stream().mapToInt(EnvironmentalForecastPoint::heatRisk).max().orElse(0);
        int maxAqi = forecast.stream().mapToInt(EnvironmentalForecastPoint::aqi).max().orElse(0);
        if ((summary.contains("暴雨") || summary.contains("雷电")) && maxRain < 60) return false;
        if ((summary.contains("高温") || summary.contains("中暑")) && maxHeat < 55) return false;
        if ((summary.contains("空气污染") || summary.contains("雾霾")) && maxAqi < 80) return false;
        if (summary.contains("台风") || summary.contains("冰雹") || summary.contains("沙尘")) return false;
        return citationIds.stream().allMatch(id -> summary.contains("[" + id + "]"));
    }

    private int elapsedMillis(long startedAt) {
        return (int) TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
    }

    private void emit(List<ToolTraceItem> trace, Consumer<ToolTraceItem> listener, ToolTraceItem item) {
        trace.add(item);
        listener.accept(item);
    }

    private List<String> buildActions(TimeSlotScore slot, ActivityDecisionRequest request) {
        String sceneAction = switch (request.activityType()) {
            case "校园运动会" -> "按项目和年级设置检录、补水、医疗与延期触发机制";
            case "体育课" -> "教师按课时缩短连续运动段，并保留室内替代课程";
            case "社区活动" -> "设置老幼休息区、无障碍动线与分批到场安排";
            case "户外训练" -> "按训练负荷设置心率观察和强度下调阈值";
            case "研学活动" -> "按路线节点设置集合清点、交通衔接与临时避险点";
            case "旅游规划" -> "按景点开放时段、步行暴露和天气窗口安排路线顺序";
            default -> "明确现场负责人、休息点与天气触发条件";
        };
        List<String> actions = new ArrayList<>(List.of(sceneAction,
                slot.heatRisk() >= 58 ? "设置补水和遮阴休息区，每30分钟检查参与者状态" : "保留常规补水与休息安排",
                slot.aqi() >= 80 ? "减少持续耐力项目，并关注敏感参与者状态" : "空气条件允许开展常规户外项目",
                slot.rainProbability() >= 40 ? "提前确认室内场地并设置降雨触发条件" : "保留场地防滑与短时降雨检查"));
        if (request.siteObservation() != null && !request.siteObservation().isBlank())
            actions.add("活动前按场地影像提示复核遮阴、排水、地面和疏散通道");
        return List.copyOf(actions);
    }

    private String buildContingency(TimeSlotScore slot) {
        return "持续监测逐小时预报；当US AQI超过100、热风险进入高等级或降水概率超过60%时转入室内。" +
                (slot.score() < 48 ? "当前候选时段不宜按原强度举办，应优先延期或转场。" : "现场负责人应在活动前30分钟复核触发条件。");
    }

    private String safe(String value) { return value == null ? "" : value; }

    private String toJson(ActivityDecisionRequest request) {
        try { return objectMapper.writeValueAsString(request); }
        catch (JacksonException exception) { return "{}"; }
    }
}
