package com.shihou.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.core.type.TypeReference;
import org.springframework.core.io.ClassPathResource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PolicyRagServiceTests {
    private PolicyRagService service;

    @BeforeEach
    void setUp() {
        service = new PolicyRagService(new ObjectMapper());
        service.loadCorpus();
    }

    @Test
    void retrievesSchoolSafetyEvidenceForSportsMeet() {
        var results = service.retrieve("校园运动会", "儿童青少年", "杭州 浙江",
                List.of("大型活动 医疗 应急", "高温 补水"), 5);

        assertThat(results).hasSize(5);
        assertThat(results.stream().limit(3).map(item -> item.id()).toList())
                .anyMatch(id -> id.startsWith("moe-"));
        assertThat(results).allMatch(item -> item.sourceUrl().startsWith("https://"));
    }

    @Test
    void retrievesTravelAndRainEvidenceForZhejiangTourism() {
        var results = service.retrieve("旅游规划", "普通人群", "杭州 浙江",
                List.of("暴雨 涉水 撤离"), 4);

        assertThat(results).extracting(item -> item.id())
                .contains("zhejiang-culture-weather-guide");
        assertThat(service.mode()).contains("bm25").contains("rrf");
        assertThat(service.corpusSize()).isGreaterThanOrEqualTo(50);
    }

    @Test
    void passesGroundedRetrievalEvaluationSet() throws Exception {
        var mapper = new ObjectMapper();
        try (var input = new ClassPathResource("knowledge/rag-evaluation.json").getInputStream()) {
            List<EvalCase> cases = mapper.readValue(input, new TypeReference<>() { });
            long hits = cases.stream().filter(item -> service.retrieve(item.activityType(), item.group(),
                    item.region(), item.risks(), 5).stream().limit(3)
                    .anyMatch(result -> result.id().startsWith(item.expectedPrefix()))).count();
            assertThat((double) hits / cases.size()).isGreaterThanOrEqualTo(0.8);
        }
    }

    @Test
    void doesNotUseBeijingOnlyGuidanceForHangzhou() {
        var results = service.retrieve("社区活动", "老年人", "杭州 浙江", List.of("高温 高湿"), 8);
        assertThat(results).extracting(item -> item.id()).doesNotContain("beijing-heat-humidity-2026");
    }

    private record EvalCase(String activityType, String group, String region,
                            List<String> risks, String expectedPrefix) { }
}
