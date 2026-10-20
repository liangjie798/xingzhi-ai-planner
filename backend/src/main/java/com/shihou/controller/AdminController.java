package com.shihou.controller;

import com.shihou.dao.DecisionRecordRepository;
import com.shihou.dao.SearchLogRepository;
import com.shihou.dao.UserRepository;
import com.shihou.entity.SearchLogEntity;
import com.shihou.entity.UserEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {
    private final UserRepository users; private final SearchLogRepository searches; private final DecisionRecordRepository decisions;
    public AdminController(UserRepository users, SearchLogRepository searches, DecisionRecordRepository decisions) {
        this.users = users; this.searches = searches; this.decisions = decisions;
    }
    @GetMapping("/overview") public Overview overview() { return new Overview(users.countByRole("USER"), searches.count(), decisions.count()); }
    @GetMapping("/users") public List<UserItem> users() { return users.findAllByOrderByCreatedAtDesc().stream().map(UserItem::from).toList(); }
    @GetMapping("/searches") public List<SearchItem> searches() { return searches.findTop100ByOrderByCreatedAtDesc().stream().map(SearchItem::from).toList(); }

    public record Overview(long registeredUsers, long searches, long decisions) { }
    public record UserItem(Long id, String username, String displayName, String role, boolean enabled, Instant createdAt) {
        static UserItem from(UserEntity value) { return new UserItem(value.getId(), value.getUsername(), value.getDisplayName(), value.getRole(), value.isEnabled(), value.getCreatedAt()); }
    }
    public record SearchItem(Long id, String query, int resultCount, String username, String actorType, Instant createdAt) {
        static SearchItem from(SearchLogEntity value) { return new SearchItem(value.getId(), value.getQueryText(), value.getResultCount(), value.getUsername(), value.getActorType(), value.getCreatedAt()); }
    }
}
