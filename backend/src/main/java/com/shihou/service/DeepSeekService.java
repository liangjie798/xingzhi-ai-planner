package com.shihou.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.shihou.config.DeepSeekProperties;
import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.EvidenceItem;
import com.shihou.dto.TimeSlotScore;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class DeepSeekService {
    private final DeepSeekProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public DeepSeekService(DeepSeekProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.restClient = RestClient.builder().baseUrl(properties.baseUrl()).build();
        this.objectMapper = objectMapper;
    }

    public Optional<String> explain(ActivityDecisionRequest request, TimeSlotScore bestSlot,
                                    List<String> actions, List<EvidenceItem> evidence) {
        if (!properties.configured()) return Optional.empty();
        try {
            String evidenceText = evidence.stream()
                    .map(item -> item.title() + "：" + item.excerpt())
                    .reduce((left, right) -> left + "；" + right)
                    .orElse("无可用依据");
            String prompt = """
                    你是“适候”户外活动决策Agent。请根据已经由确定性工具计算的结果，生成80至120字中文解释。
                    环境数值来自实时天气与空气质量预报接口。不得修改数值，不得虚构监测站、规定或法律要求。
                    必须提到推荐时段、核心风险和一项执行措施。只参考下列已检索依据，不得扩展未列出的规定。
                    活动：%s；人群：%s；地点：%s；最佳时段：%s；适宜度：%d；气温：%.1f℃；AQI：%d；热风险：%d；降雨概率：%d%%；措施：%s；依据：%s
                    """.formatted(request.activityType(), request.group(), request.locationName(),
                    bestSlot.label(), bestSlot.score(), bestSlot.temperature(), bestSlot.aqi(),
                    bestSlot.heatRisk(), bestSlot.rainProbability(), String.join("；", actions), evidenceText);
            Map<String, Object> body = Map.of(
                    "model", properties.model(),
                    "temperature", 0.2,
                    "messages", List.of(
                            Map.of("role", "system", "content", "输出稳定、可解释、谨慎的户外活动建议。"),
                            Map.of("role", "user", "content", prompt)
                    )
            );
            String raw = restClient.post()
                    .uri("/chat/completions")
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode root = objectMapper.readTree(raw);
            return Optional.ofNullable(root.at("/choices/0/message/content").asText(null))
                    .filter(content -> !content.isBlank() && content.length() <= 600);
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }
}

