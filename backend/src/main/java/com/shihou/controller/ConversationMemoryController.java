package com.shihou.controller;

import com.shihou.dao.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Per-account memory for members, per-session memory for guests. Never accepts a target user ID. */
@RestController
@RequestMapping("/api/v1/conversation-memory")
public class ConversationMemoryController {
    private final UserRepository users;
    private final ObjectMapper mapper;
    public ConversationMemoryController(UserRepository users, ObjectMapper mapper) { this.users = users; this.mapper = mapper; }
    @GetMapping
    public JsonNode read(Authentication auth, HttpServletRequest request) throws Exception {
        String saved = auth == null ? null : users.findByUsername(auth.getName()).map(u -> u.getConversationMemory()).orElse(null);
        if (saved == null && request.getSession(false) != null) saved = (String) request.getSession(false).getAttribute("conversation-memory");
        return saved == null ? mapper.createObjectNode() : mapper.readTree(saved);
    }
    @PutMapping
    public void save(@RequestBody JsonNode body, Authentication auth, HttpServletRequest request) {
        String value = body.toString();
        if (!body.isObject() || value.length() > 1000000 || !body.path("messages").isArray() || body.path("messages").size() > 100)
            throw new IllegalArgumentException("对话记忆格式不正确或容量超限");
        if (auth != null && users.findByUsername(auth.getName()).isPresent()) {
            var user = users.findByUsername(auth.getName()).orElseThrow();
            user.setConversationMemory(value); users.save(user);
        } else request.getSession(true).setAttribute("conversation-memory", value);
    }
    @DeleteMapping
    public void clear(Authentication auth, HttpServletRequest request) {
        if (auth != null) users.findByUsername(auth.getName()).ifPresent(user -> { user.setConversationMemory(null); users.save(user); });
        if (request.getSession(false) != null) request.getSession(false).removeAttribute("conversation-memory");
    }
}
