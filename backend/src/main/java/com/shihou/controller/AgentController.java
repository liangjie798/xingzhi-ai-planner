package com.shihou.controller;

import com.shihou.annotation.Traceable;
import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.service.DecisionService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.security.Principal;

/** Streams actual tool events followed by the verified decision. */
@Traceable
@RestController
@RequestMapping("/api/v2/agent")
public class AgentController {
    private final DecisionService decisionService;

    public AgentController(DecisionService decisionService) {
        this.decisionService = decisionService;
    }

    @PostMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody ActivityDecisionRequest request, Principal principal) {
        SseEmitter emitter = new SseEmitter(45_000L);
        String username = principal == null ? null : principal.getName();
        CompletableFuture.runAsync(() -> {
            try {
                var result = decisionService.analyze(request, item -> send(emitter, "trace", item), username);
                emitter.send(SseEmitter.event().name("result").data(result));
                emitter.complete();
            } catch (Exception exception) {
                send(emitter, "error", new ErrorEvent(exception.getMessage() == null ? "Agent执行失败" : exception.getMessage()));
                emitter.completeWithError(exception);
            }
        });
        return emitter;
    }

    private void send(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (IOException exception) {
            throw new IllegalStateException("SSE connection closed", exception);
        }
    }

    private record ErrorEvent(String detail) { }
}
