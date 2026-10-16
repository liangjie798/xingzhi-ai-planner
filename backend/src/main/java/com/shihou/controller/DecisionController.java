package com.shihou.controller;

import com.shihou.annotation.Traceable;
import com.shihou.dto.ActivityDecisionRequest;
import com.shihou.dto.ActivityDecisionResponse;
import com.shihou.service.DecisionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Traceable
@RestController
@RequestMapping("/api/v1/decisions")
public class DecisionController {
    private final DecisionService decisionService;

    public DecisionController(DecisionService decisionService) {
        this.decisionService = decisionService;
    }

    @PostMapping("/analyze")
    public ActivityDecisionResponse analyze(@Valid @RequestBody ActivityDecisionRequest request) {
        return decisionService.analyze(request);
    }
}

