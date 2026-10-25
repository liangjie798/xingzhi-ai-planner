package com.shihou.controller;

import com.shihou.dao.DecisionRecordRepository;
import com.shihou.dao.SearchLogRepository;
import com.shihou.dao.UserRepository;
import com.shihou.dao.FeedbackRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
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
    private final FeedbackRepository feedback; private final PasswordEncoder encoder;
    public AdminController(UserRepository users, SearchLogRepository searches, DecisionRecordRepository decisions, FeedbackRepository feedback, PasswordEncoder encoder) {
        this.users = users; this.searches = searches; this.decisions = decisions; this.feedback = feedback; this.encoder = encoder;
    }
    @GetMapping("/overview") public Overview overview() { return new Overview(users.countByRole("USER"), searches.count(), decisions.count()); }
    @GetMapping("/users") public List<UserItem> users() { return users.findAllByOrderByCreatedAtDesc().stream().map(UserItem::from).toList(); }
    @GetMapping("/searches") public List<SearchItem> searches() { return searches.findTop100ByOrderByCreatedAtDesc().stream().map(SearchItem::from).toList(); }

    @GetMapping("/feedback") public List<com.shihou.entity.FeedbackEntity> feedback() { return feedback.findTop200ByOrderByCreatedAtDesc(); }
    @PostMapping("/users") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public UserItem createUser(@Valid @RequestBody CreateUser body) {
        if (users.findByUsername(body.username()).isPresent()) throw new IllegalArgumentException("用户名已存在");
        return UserItem.from(users.save(new UserEntity(body.username(), encoder.encode(body.password()), body.displayName(), "USER")));
    }
    @PatchMapping("/users/{id}")
    public UserItem updateUser(@PathVariable Long id, @Valid @RequestBody UpdateUser body) {
        var user = manageableUser(id);
        user.updateByAdministrator(body.displayName(), body.enabled(), body.password() == null ? null : encoder.encode(body.password()));
        return UserItem.from(users.save(user));
    }
    @DeleteMapping("/users/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    @org.springframework.transaction.annotation.Transactional
    public void deleteUser(@PathVariable Long id) {
        var user = manageableUser(id);
        decisions.deleteByCreatedBy(user.getUsername()); searches.deleteByUsername(user.getUsername()); feedback.deleteByUsername(user.getUsername());
        users.delete(user);
    }
    @PatchMapping("/feedback/{id}")
    public com.shihou.entity.FeedbackEntity updateFeedback(@PathVariable Long id, @Valid @RequestBody UpdateFeedback body) {
        var item = feedback.findById(id).orElseThrow(() -> new IllegalArgumentException("反馈不存在"));
        item.update(body.status(), body.adminReply());
        return feedback.save(item);
    }
    @DeleteMapping("/feedback/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void deleteFeedback(@PathVariable Long id) {
        if (!feedback.existsById(id)) throw new IllegalArgumentException("反馈不存在");
        feedback.deleteById(id);
    }
    private UserEntity manageableUser(Long id) {
        var user = users.findById(id).orElseThrow(() -> new IllegalArgumentException("用户不存在"));
        if (!"USER".equals(user.getRole())) throw new IllegalArgumentException("管理员账户受保护，不能在用户管理中修改或删除");
        return user;
    }
    public record CreateUser(@NotBlank @Pattern(regexp="[A-Za-z0-9_]{3,24}") String username, @NotBlank @Size(min=8,max=72) String password, @NotBlank @Size(min=2,max=30) String displayName) { }
    public record UpdateUser(@Size(min=2,max=30) String displayName, Boolean enabled, @Size(min=8,max=72) String password) { }
    public record UpdateFeedback(@Pattern(regexp="OPEN|IN_PROGRESS|RESOLVED") String status, @Size(max=2000) String adminReply) { }

    public record Overview(long registeredUsers, long searches, long decisions) { }
    public record UserItem(Long id, String username, String displayName, String role, boolean enabled, Instant createdAt) {
        static UserItem from(UserEntity value) { return new UserItem(value.getId(), value.getUsername(), value.getDisplayName(), value.getRole(), value.isEnabled(), value.getCreatedAt()); }
    }
    public record SearchItem(Long id, String query, int resultCount, String username, String actorType, Instant createdAt) {
        static SearchItem from(SearchLogEntity value) { return new SearchItem(value.getId(), value.getQueryText(), value.getResultCount(), value.getUsername(), value.getActorType(), value.getCreatedAt()); }
    }
}
