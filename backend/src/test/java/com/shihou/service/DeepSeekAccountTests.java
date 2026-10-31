package com.shihou.service;

import com.shihou.config.DeepSeekProperties;
import com.shihou.entity.UserEntity;
import com.shihou.dto.TimeSlotScore;
import com.shihou.dto.EvidenceItem;
import com.shihou.dto.ActivityDecisionRequest;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeepSeekAccountTests {
    final ObjectMapper mapper = new ObjectMapper();
    final DeepSeekProperties defaults = new DeepSeekProperties("", "", "", "", "");

    class Client extends DeepSeekService {
        DeepSeekProperties used;
        JsonNode response;
        int calls;
        Client(UserModelConfigService configs) { super(defaults, mapper, configs); }
        @Override JsonNode call(Map<String,Object> body, DeepSeekProperties config) {
            calls++; used=config; return response;
        }
    }

    @Test void accountConfigurationIsUsedForBothToolPlanningAndSynthesis() {
        var configs=mock(UserModelConfigService.class);
        var user=new UserEntity("qa-user","unused","QA","USER");
        user.updateModelConfig("custom","QA model","https://models.example.org/v1","requested-model","encrypted-placeholder");
        when(configs.requireUser("qa-user")).thenReturn(user);
        when(configs.decryptApiKey(user)).thenReturn("test-only-placeholder");
        var client=new Client(configs);
        var request=new ActivityDecisionRequest("hangzhou","校园运动会","2026-11-01",null,14,2,40,"中强度","普通人群","操场","杭州市","浙江省","330100",120.1,30.2,null,14,18);
        client.response=mapper.readTree("{\"model\":\"returned-model\",\"choices\":[{\"message\":{\"tool_calls\":[{\"function\":{\"name\":\"get_environment_window\"}}]}}]}");
        var plan=client.plan(request,"qa-user");
        assertTrue(plan.modelPlanned());assertTrue(plan.model().contains("returned-model"));
        assertEquals("requested-model",client.used.activeModel());
        assertEquals("test-only-placeholder",client.used.activeApiKey());
        var content=mapper.writeValueAsString(Map.of("summary","14:00开始，注意天气并保留备选。[e1]","citationIds",List.of("e1")));
        client.response=mapper.valueToTree(Map.of("model","returned-model","choices",List.of(Map.of("message",Map.of("content",content)))));
        var evidence=new EvidenceItem("e1","测试依据","测试来源","安全依据","政策","https://example.org","2026-10-30","1",1);
        var narrative=client.synthesize(request,new TimeSlotScore("2026-11-01",14,"14:00",20,40,5,0,90,"适宜"),List.of("补水"),"天气恶化时暂停",List.of(evidence),plan.tools(),"qa-user");
        assertTrue(narrative.isPresent());assertTrue(narrative.get().model().contains("returned-model"));
        assertEquals(2,client.calls);verify(configs,times(2)).requireUser("qa-user");
    }

    @Test void missingToolCallsNeverClaimAutonomousPlanningSucceeded() {
        var configs=mock(UserModelConfigService.class);
        var user=new UserEntity("qa-user","unused","QA","USER");
        user.updateModelConfig("custom","QA","https://models.example.org/v1","model","placeholder");
        when(configs.requireUser("qa-user")).thenReturn(user);when(configs.decryptApiKey(user)).thenReturn("test-placeholder");
        var client=new Client(configs);client.response=mapper.readTree("{\"choices\":[{\"message\":{\"content\":\"answer without tools\"}}]}");
        assertFalse(client.plan(null,"qa-user").modelPlanned());
    }

    @Test void brokenAccountConfigurationFallsBackWithoutNetworkOrLeakingDetails() {
        var configs=mock(UserModelConfigService.class);
        when(configs.requireUser("qa-user")).thenThrow(new IllegalStateException("private-config-value"));
        var client=new Client(configs);var plan=client.plan(null,"qa-user");
        assertFalse(plan.modelPlanned());assertFalse(plan.rationale().contains("private-config-value"));
        assertTrue(client.synthesize(null,null,List.of(),"",List.of(),List.of(),"qa-user").isEmpty());
        assertEquals(0,client.calls);
    }
}
