package com.shihou.config;

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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class AdminReadOnlyAccessTests {
    @Autowired private WebApplicationContext application;
    @Autowired private FilterChainProxy securityFilters;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(application).addFilters(securityFilters).build();
    }

    private MockHttpSession session(String role) {
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                "permission-test-" + role, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
        var session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        return session;
    }

    @Test
    void administratorsCanReadStatisticsButCannotInvokeBusinessTools() throws Exception {
        for (String role : List.of("ADMIN", "SUPER_ADMIN")) {
            mvc.perform(get("/api/v1/admin/overview").session(session(role))).andExpect(status().isOk());
            for (String path : List.of("/api/v1/decisions/analyze", "/api/v2/agent/stream", "/api/v1/analytics/search")) {
                // These endpoints are CSRF-exempt, so rejection verifies role enforcement.
                mvc.perform(post(path).session(session(role)).contentType("application/json").content("{}"))
                        .andExpect(status().isForbidden());
            }
            mvc.perform(get("/api/v1/account/model-config").session(session(role))).andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/cities").session(session(role))).andExpect(status().isForbidden());
        }
    }

    @Test
    void normalUsersRetainTheirOwnHistoryAndCannotReadAdminData() throws Exception {
        mvc.perform(get("/api/v1/account/decisions").session(session("USER"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/overview").session(session("USER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/overview").session(session("GUEST"))).andExpect(status().isForbidden());
    }
}
