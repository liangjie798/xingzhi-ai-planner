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
class ConversationSessionTests {
    @Autowired WebApplicationContext app;
    @Autowired FilterChainProxy filters;
    @Autowired UserRepository users;
    @Autowired ObjectMapper json;
    MockMvc mvc;
    @BeforeEach void setup(){mvc=MockMvcBuilders.webAppContextSetup(app).addFilters(filters).build();}
    MockHttpSession member(String name){
        if(users.findByUsername(name).isEmpty())users.save(new UserEntity(name,"unused","会话测试","USER"));
        var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(name,null,List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        var session=new MockHttpSession();session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,context);return session;
    }
    MockHttpServletRequestBuilder csrf(MockHttpServletRequestBuilder request,MockHttpSession session) throws Exception{
        var response=mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn().getResponse();var token=json.readTree(response.getContentAsString());
        return request.session(session).cookie(response.getCookie("XSRF-TOKEN")).header(token.get("headerName").asText(),token.get("token").asText());
    }
    String create(MockHttpSession session,String body) throws Exception{return json.readTree(mvc.perform(csrf(post("/api/v1/conversation-sessions"),session).contentType("application/json").content(body)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asText();}
    final String first="""
      {"version":1,"messages":[{"role":"user","content":"杭州运动会"}],"intake":{"known":{"cityName":"杭州市"}},"weatherContext":{"cityName":"西安"},"workspaceData":{"plans":[{"label":"原方案"}]},"weatherComparison":{"cityName":"杭州市"}}
      """;
    final String fresh="{\"version\":1,\"messages\":[],\"intake\":{\"known\":{}}}";
    @Test void historiesAreIndependentAndAnAccountCannotReadWriteOrDeleteAnotherAccountsSession() throws Exception{
        var owner=member("sessions-owner");var other=member("sessions-other");String a=create(owner,first);String b=create(owner,fresh);
        var saved=json.readTree(mvc.perform(get("/api/v1/conversation-sessions/"+a).session(owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("原方案",saved.at("/workspaceData/plans/0/label").asText());
        assertEquals("杭州市",saved.at("/weatherComparison/cityName").asText());
        var list=json.readTree(mvc.perform(get("/api/v1/conversation-sessions").session(owner)).andReturn().getResponse().getContentAsString());assertEquals(2,list.size());assertFalse(list.get(0).has("snapshot"));
        mvc.perform(get("/api/v1/conversation-sessions/"+a).session(other)).andExpect(status().isNotFound());
        mvc.perform(csrf(put("/api/v1/conversation-sessions/"+a),other).contentType("application/json").content(fresh)).andExpect(status().isNotFound());
        mvc.perform(csrf(delete("/api/v1/conversation-sessions/"+a),other)).andExpect(status().isNotFound());
        mvc.perform(csrf(put("/api/v1/conversation-sessions/"+b),owner).contentType("application/json").content(fresh)).andExpect(status().isOk());
        assertEquals("杭州市",json.readTree(mvc.perform(get("/api/v1/conversation-sessions/"+a).session(owner)).andReturn().getResponse().getContentAsString()).at("/intake/known/cityName").asText());
        for(String id:List.of(a,b))mvc.perform(csrf(delete("/api/v1/conversation-sessions/"+id),owner)).andExpect(status().isOk());
    }
    @Test void guestConversationsAreIsolatedAndClearingOneDoesNotClearTheOther() throws Exception{
        var owner=new MockHttpSession();var other=new MockHttpSession();String a=create(owner,first);String b=create(owner,first);
        mvc.perform(get("/api/v1/conversation-sessions/"+a).session(other)).andExpect(status().isNotFound());
        mvc.perform(csrf(put("/api/v1/conversation-sessions/"+a),owner).contentType("application/json").content(fresh)).andExpect(status().isOk());
        assertEquals("西安",json.readTree(mvc.perform(get("/api/v1/conversation-sessions/"+b).session(owner)).andReturn().getResponse().getContentAsString()).at("/weatherContext/cityName").asText());
        for(String id:List.of(a,b))mvc.perform(csrf(delete("/api/v1/conversation-sessions/"+id),owner)).andExpect(status().isOk());
    }
    @Test void authenticatedGuestDoesNotNeedARegisteredUserRow() throws Exception{
        var owner=new MockHttpSession();var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated("guest-test",null,List.of(new SimpleGrantedAuthority("ROLE_GUEST"))));owner.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,context);
        String id=create(owner,first);mvc.perform(get("/api/v1/conversation-sessions/"+id).session(owner)).andExpect(status().isOk());mvc.perform(csrf(delete("/api/v1/conversation-sessions/"+id),owner)).andExpect(status().isOk());
    }
}
