package com.shihou.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

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
        assertThat(service.corpusSize()).isGreaterThanOrEqualTo(8);
    }
}
