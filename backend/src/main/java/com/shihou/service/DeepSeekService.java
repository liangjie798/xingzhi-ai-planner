package com.shihou.service;

import com.shihou.config.DeepSeekProperties;
import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.EvidenceItem;
import com.shihou.dto.TimeSlotScore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** DeepSeek client for tool selection and grounded structured synthesis. */
@Service
public class DeepSeekService {
    private static final Logger log = LoggerFactory.getLogger(DeepSeekService.class);
    private static final List<String> REQUIRED_TOOLS = List.of(
            "get_environment_window", "retrieve_policy_evidence", "score_activity_slots",
            "compare_activity_plans", "build_contingency_plan");
    private static final Set<String> ALLOWED_TOOLS = Set.copyOf(REQUIRED_TOOLS);

    private final DeepSeekProperties properties;
    private final ObjectMapper objectMapper;

    public DeepSeekService(DeepSeekProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /** Lets the model request concrete tools through the OpenAI-compatible Function Calling protocol. */
    public AgentPlan plan(ActivityDecisionRequest request) {
        // The no-key provider is rate-limited to one request per 30 seconds. Reserve
        // that request for grounded synthesis; a configured DeepSeek key runs the
        // full model-planned Function Calling path.
        if (!properties.primaryConfigured())
            return AgentPlan.fallback(REQUIRED_TOOLS, "未配置DeepSeek密钥，使用受控安全计划并保留模型调用用于证据化生成");
        try {
            Map<String, Object> body = Map.of(
                    "model", properties.activeModel(),
                    "temperature", 0.1,
                    "messages", List.of(
                            Map.of("role", "system", "content", "你是适候决策规划Agent。必须通过工具取得数据，禁止直接给结论。"),
                            Map.of("role", "user", "content", "请为以下活动选择所需工具并说明调用参数：" + objectMapper.writeValueAsString(request))
                    ),
                    "tools", toolDefinitions(),
                    "tool_choice", "auto"
            );
            JsonNode message = call(body).at("/choices/0/message");
            LinkedHashSet<String> names = new LinkedHashSet<>();
            JsonNode calls = message.path("tool_calls");
            if (calls.isArray()) calls.forEach(call -> {
                String name = call.at("/function/name").asText("");
                if (ALLOWED_TOOLS.contains(name)) names.add(name);
            });
            // Safety tools are mandatory even when a model omits one.
            names.addAll(REQUIRED_TOOLS);
            String rationale = message.path("content").asText("模型已通过 Function Calling 规划工具链");
            return new AgentPlan(List.copyOf(names), rationale.isBlank() ? "模型已通过 Function Calling 规划工具链" : rationale,
                    true, properties.activeProvider() + " / " + properties.activeModel());
        } catch (Exception exception) {
            log.warn("Agent tool planning failed: {}", exception.getMessage());
            return AgentPlan.fallback(REQUIRED_TOOLS, "模型规划失败，执行安全必选工具");
        }
    }

    /** Generates prose and measures only from supplied tool results. */
    public Optional<AgentNarrative> synthesize(ActivityDecisionRequest request, TimeSlotScore bestSlot,
                                                List<String> deterministicActions, String contingency,
                                                List<EvidenceItem> evidence, List<String> plan) {
        if (!properties.configured()) return Optional.empty();
        try {
            List<Map<String, Object>> citedEvidence = evidence.stream().map(item -> Map.<String, Object>of(
                    "id", item.id(), "title", item.title(), "publisher", item.publisher(),
                    "section", item.section(), "excerpt", item.excerpt(), "url", item.sourceUrl())).toList();
            Map<String, Object> facts = Map.of(
                    "request", request,
                    "bestSlot", bestSlot,
                    "actions", deterministicActions,
                    "contingency", contingency,
                    "evidence", citedEvidence,
                    "executedTools", plan
            );
            String prompt = (properties.primaryConfigured() ? """
                    只根据下面工具结果生成决策。返回 JSON 对象，字段为 summary、actions、contingency、confidence、citationIds。
                    summary 为100至180字中文，必须包含最佳时段、关键风险和举办方式，并以[证据ID]引用至少一条依据。
                    actions 为3至5条短句；不得修改任何环境数值、时段或适宜度；不得发明法规、来源或监测站。
                    confidence 是0到1的小数；citationIds只能取 evidence 中出现的id。
                    """ : """
                    只根据下面工具结果返回紧凑 JSON，字段仅为 summary、confidence、citationIds。
                    summary 为80至120字中文，包含最佳时段、关键风险和举办方式，并以[证据ID]引用一条依据。
                    confidence 是0到1的小数；citationIds只能取 evidence 中出现的id。不要输出解释或Markdown。
                    """) + "JSON数据：" + objectMapper.writeValueAsString(facts);
            Map<String, Object> body = new java.util.LinkedHashMap<>();
            body.put("model", properties.activeModel());
            body.put("temperature", 0.15);
            body.put("max_tokens", properties.primaryConfigured() ? 900 : 350);
            if (properties.primaryConfigured()) body.put("response_format", Map.of("type", "json_object"));
            body.put("messages", List.of(
                    Map.of("role", "system", "content", "你是受控户外活动决策Agent。输出合法json，不输出Markdown。"),
                    Map.of("role", "user", "content", prompt)
            ));
            String content = call(body).at("/choices/0/message/content").asText("");
            JsonNode json = objectMapper.readTree(stripFence(content));
            String summary = json.path("summary").asText("").trim();
            if (summary.isBlank() || summary.length() > 900) return Optional.empty();
            List<String> actions = strings(json.path("actions"), 5);
            String safeContingency = json.path("contingency").asText(contingency).trim();
            double confidence = Math.max(0.0, Math.min(1.0, json.path("confidence").asDouble(0.78)));
            Set<String> allowedCitations = evidence.stream().map(EvidenceItem::id).collect(java.util.stream.Collectors.toSet());
            List<String> citations = strings(json.path("citationIds"), 8).stream().filter(allowedCitations::contains).toList();
            return Optional.of(new AgentNarrative(summary,
                    actions.isEmpty() ? deterministicActions : actions,
                    safeContingency.isBlank() ? contingency : safeContingency,
                    confidence, citations, properties.activeProvider() + " / " + properties.activeModel()));
        } catch (Exception exception) {
            log.warn("Grounded decision synthesis failed: {}", exception.getMessage());
            return Optional.empty();
        }
    }

    private JsonNode call(Map<String, Object> body) throws Exception {
        String baseUrl = properties.activeBaseUrl().replaceAll("/+$", "");
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + "/chat/completions"))
                .timeout(Duration.ofSeconds(28))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        if (!properties.activeApiKey().isBlank())
            request.header("Authorization", "Bearer " + properties.activeApiKey());
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
        HttpResponse<byte[]> response = client.send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
        String raw = new String(response.body(), java.nio.charset.StandardCharsets.UTF_8);
        if (response.statusCode() < 200 || response.statusCode() >= 300)
            throw new IllegalStateException("模型接口HTTP " + response.statusCode() + ": " + raw.substring(0, Math.min(300, raw.length())));
        return objectMapper.readTree(raw);
    }

    private List<Map<String, Object>> toolDefinitions() {
        return List.of(
                tool("get_environment_window", "读取活动日期范围内真实逐小时天气和空气质量", Map.of("type", "object", "properties", Map.of("dateRange", Map.of("type", "string")))),
                tool("retrieve_policy_evidence", "从中国大陆政府公开资料知识库检索可核验依据", Map.of("type", "object", "properties", Map.of("riskKeywords", Map.of("type", "array", "items", Map.of("type", "string"))))),
                tool("score_activity_slots", "使用确定性安全算法为候选时段评分", emptyParameters()),
                tool("compare_activity_plans", "比较按计划、调整时段和备用场地方案", emptyParameters()),
                tool("build_contingency_plan", "根据风险阈值生成触发式应急预案", emptyParameters())
        );
    }

    private Map<String, Object> tool(String name, String description, Map<String, Object> parameters) {
        return Map.of("type", "function", "function", Map.of("name", name, "description", description, "parameters", parameters));
    }

    private Map<String, Object> emptyParameters() {
        return Map.of("type", "object", "properties", Map.of(), "additionalProperties", false);
    }

    private List<String> strings(JsonNode node, int limit) {
        List<String> values = new ArrayList<>();
        if (node.isArray()) node.forEach(item -> {
            String value = item.asText("").trim();
            if (!value.isBlank() && values.size() < limit) values.add(value);
        });
        return values;
    }

    private String stripFence(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.startsWith("```")) {
            int firstLine = trimmed.indexOf('\n');
            int end = trimmed.lastIndexOf("```");
            if (firstLine >= 0 && end > firstLine) return trimmed.substring(firstLine + 1, end).trim();
        }
        return trimmed;
    }

    public record AgentPlan(List<String> tools, String rationale, boolean modelPlanned, String model) {
        static AgentPlan fallback(List<String> tools, String rationale) {
            return new AgentPlan(List.copyOf(tools), rationale, false, "deterministic-safety-planner");
        }
    }

    public record AgentNarrative(String summary, List<String> actions, String contingency,
                                 double confidence, List<String> citationIds, String model) { }
}
