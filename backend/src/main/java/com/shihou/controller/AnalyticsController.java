package com.shihou.controller;

import com.shihou.dao.SearchLogRepository;
import com.shihou.entity.SearchLogEntity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {
    private final SearchLogRepository searches;
    public AnalyticsController(SearchLogRepository searches) { this.searches = searches; }

    @PostMapping("/search")
    public void recordSearch(@Valid @RequestBody SearchEvent event, Authentication authentication) {
        String username = authentication == null ? null : authentication.getName();
        String actorType = authentication == null ? "ANONYMOUS" : authentication.getAuthorities().stream()
                .anyMatch(role -> role.getAuthority().equals("ROLE_GUEST")) ? "GUEST" : "REGISTERED";
        searches.save(new SearchLogEntity(event.query().trim(), event.resultCount(), username, actorType));
    }

    public record SearchEvent(@NotBlank @Size(max = 100) String query,
                              @Min(0) @Max(100) int resultCount) { }
}
