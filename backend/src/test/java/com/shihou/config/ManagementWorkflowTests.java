package com.shihou.config;

import com.shihou.dao.UserRepository;
import com.shihou.entity.UserEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.ObjectMapper;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class ManagementWorkflowTests {
    @Autowired WebApplicationContext app;
    @Autowired FilterChainProxy filters;
    @Autowired UserRepository users;
    @Autowired ObjectMapper json;
    MockMvc mvc;
    @BeforeEach void setup() { mvc = MockMvcBuilders.webAppContextSetup(app).addFilters(filters).build(); }
    MockHttpSession session(String username, String role) {
        if (role.equals("USER") && users.findByUsername(username).isEmpty()) users.save(new UserEntity(username, "unused", "测试用户", role));
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(username, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
        var session = new MockHttpSession(); session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context); return session;
    }
    MockHttpServletRequestBuilder csrf(MockHttpServletRequestBuilder request, MockHttpSession session) throws Exception {
        var result = mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn();
        var token = json.readTree(result.getResponse().getContentAsString());
        return request.session(session).cookie(result.getResponse().getCookie("XSRF-TOKEN")).header(token.get("headerName").asText(), token.get("token").asText());
    }
    @Test void administratorCanCreateUpdateDisableAndDeleteOrdinaryUsersButCannotDeleteAdministrators() throws Exception {
        var admin = session("management-admin", "SUPER_ADMIN");
        String created = mvc.perform(csrf(post("/api/v1/admin/users"), admin).contentType("application/json").content("{\"username\":\"crud_fixture\",\"password\":\"fixture-pass-832\",\"displayName\":\"创建测试\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = json.readTree(created).get("id").asLong();
        assertFalse(created.contains("password"));
        var member = session("crud_fixture", "USER");
        mvc.perform(csrf(patch("/api/v1/admin/users/" + id), admin).contentType("application/json").content("{\"displayName\":\"更新测试\",\"enabled\":false}" )).andExpect(status().isOk());
        assertEquals("更新测试", users.findById(id).orElseThrow().getDisplayName());
        mvc.perform(get("/api/v1/account/decisions").session(member)).andExpect(status().isUnauthorized());
        var protectedUser = users.save(new UserEntity("protected_fixture", "unused", "管理账户", "SUPER_ADMIN"));
        mvc.perform(csrf(delete("/api/v1/admin/users/" + protectedUser.getId()), admin)).andExpect(status().isBadRequest());
        mvc.perform(csrf(delete("/api/v1/admin/users/" + id), admin)).andExpect(status().isNoContent());
        assertFalse(users.existsById(id)); users.delete(protectedUser);
    }
    @Test void memoryIsAccountScopedAndFeedbackReachesAdministratorThenReturnsReplyToItsOwner() throws Exception {
        var first = session("memory_first", "USER"); var second = session("memory_second", "USER"); var admin = session("feedback-admin", "ADMIN");
        mvc.perform(csrf(put("/api/v1/conversation-memory"), first).contentType("application/json").content("{\"version\":1,\"messages\":[{\"role\":\"user\",\"content\":\"西安天气\"}]}" )).andExpect(status().isOk());
        var relogin = session("memory_first", "USER");
        assertTrue(mvc.perform(get("/api/v1/conversation-memory").session(relogin)).andReturn().getResponse().getContentAsString().contains("西安天气"));
        assertEquals("{}", mvc.perform(get("/api/v1/conversation-memory").session(second)).andReturn().getResponse().getContentAsString());
        var created = mvc.perform(csrf(post("/api/v1/feedback"), first).contentType("application/json").content("{\"title\":\"天气追问问题\",\"content\":\"一周后应沿用西安天气上下文\"}" )).andExpect(status().isCreated()).andReturn();
        long id = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        assertTrue(mvc.perform(get("/api/v1/admin/feedback").session(admin)).andReturn().getResponse().getContentAsString().contains("一周后应沿用西安天气上下文"));
        mvc.perform(csrf(patch("/api/v1/admin/feedback/" + id), admin).contentType("application/json").content("{\"status\":\"RESOLVED\",\"adminReply\":\"已修复天气日期追问\"}" )).andExpect(status().isOk());
        assertTrue(mvc.perform(get("/api/v1/feedback").session(first)).andReturn().getResponse().getContentAsString().contains("已修复天气日期追问"));
        assertEquals("[]", mvc.perform(get("/api/v1/feedback").session(second)).andReturn().getResponse().getContentAsString());
        mvc.perform(csrf(delete("/api/v1/conversation-memory"), first)).andExpect(status().isOk());
        assertEquals("{}", mvc.perform(get("/api/v1/conversation-memory").session(first)).andReturn().getResponse().getContentAsString());
        mvc.perform(csrf(delete("/api/v1/admin/feedback/" + id), first)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/admin/feedback/" + id).session(admin)).andExpect(status().isForbidden());
        mvc.perform(csrf(delete("/api/v1/admin/feedback/" + id), admin)).andExpect(status().isNoContent());
    }
}
