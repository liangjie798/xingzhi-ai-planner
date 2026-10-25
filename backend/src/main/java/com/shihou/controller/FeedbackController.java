package com.shihou.controller;

import com.shihou.dao.FeedbackRepository;
import com.shihou.entity.FeedbackEntity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/feedback")
public class FeedbackController {
    private final FeedbackRepository feedback;
    public FeedbackController(FeedbackRepository feedback) { this.feedback = feedback; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Created submit(@Valid @RequestBody Request body, Authentication authentication, jakarta.servlet.http.HttpServletRequest request) {
        String username = owner(authentication, request);
        String actor = authentication == null ? "ANONYMOUS" : authentication.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_GUEST")) ? "GUEST" : "REGISTERED";
        var saved = feedback.save(new FeedbackEntity(username, actor, body.title(), body.content()));
        return new Created(saved.getId(), "反馈已提交，管理员可在管理平台查看");
    }
    public record Request(@NotBlank @Size(max=120) String title, @NotBlank @Size(max=4000) String content) { }
    @GetMapping
    public java.util.List<FeedbackEntity> own(Authentication auth, jakarta.servlet.http.HttpServletRequest request) {
        String username = owner(auth, request);
        return feedback.findTop50ByUsernameOrderByCreatedAtDesc(username);
    }
    private String owner(Authentication auth, jakarta.servlet.http.HttpServletRequest request) {
        if (auth != null) return auth.getName();
        var session = request.getSession(true);
        synchronized (session) {
            String owner = (String) session.getAttribute("feedback-owner");
            if (owner == null) { owner = "anonymous-" + java.util.UUID.randomUUID(); session.setAttribute("feedback-owner", owner); }
            return owner;
        }
    }
    public record Created(Long id, String message) { }
}
