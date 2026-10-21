package com.shihou.controller;

import com.shihou.dao.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import com.shihou.entity.UserEntity;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final HttpSessionSecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(AuthenticationManager authenticationManager, UserRepository users, PasswordEncoder encoder) {
        this.authenticationManager = authenticationManager;
        this.users = users;
        this.encoder = encoder;
    }

    @GetMapping("/csrf")
    public Csrf csrf(CsrfToken token) { return new Csrf(token.getHeaderName(), token.getParameterName(), token.getToken()); }

    @PostMapping("/login")
    public UserView login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(body.username(), body.password()));
        boolean admin = authentication.getAuthorities().stream().anyMatch(role -> role.getAuthority().equals("ROLE_ADMIN") || role.getAuthority().equals("ROLE_SUPER_ADMIN"));
        if (("ADMIN".equals(body.portal()) && !admin) || ("USER".equals(body.portal()) && admin))
            throw new org.springframework.security.authentication.BadCredentialsException("登录入口与账户类型不匹配");
        establish(authentication, request, response);
        return current(authentication);
    }

    @PostMapping("/register")
    public UserView register(@Valid @RequestBody RegisterRequest body, HttpServletRequest request, HttpServletResponse response) {
        if (users.findByUsername(body.username()).isPresent()) throw new IllegalArgumentException("用户名已被注册");
        var user = users.save(new UserEntity(body.username(), encoder.encode(body.password()), body.displayName(), "USER"));
        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(user.getUsername(), null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        establish(authentication, request, response);
        return current(authentication);
    }

    @PostMapping("/guest")
    public UserView guest(HttpServletRequest request, HttpServletResponse response) {
        String username = "guest-" + UUID.randomUUID().toString().substring(0, 8);
        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(username, null,
                List.of(new SimpleGrantedAuthority("ROLE_GUEST")));
        establish(authentication, request, response);
        return current(authentication);
    }

    private void establish(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
    }

    @GetMapping("/me")
    public UserView me(Principal principal) {
        return principal == null ? null : current((Authentication) principal);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
    }

    private UserView current(Authentication authentication) {
        return users.findByUsername(authentication.getName())
                .map(user -> new UserView(user.getUsername(), user.getDisplayName(), user.getRole()))
                .orElseGet(() -> new UserView(authentication.getName(), "访客", "GUEST"));
    }

    public record LoginRequest(@NotBlank @Size(max = 64) String username,
                               @NotBlank @Size(max = 128) String password,
                               @Pattern(regexp = "USER|ADMIN") String portal) {
        public LoginRequest { if (portal == null) portal = "USER"; }
    }
    public record RegisterRequest(@NotBlank @Pattern(regexp = "[A-Za-z0-9_]{3,24}") String username,
                                  @NotBlank @Size(min = 8, max = 72) String password,
                                  @NotBlank @Size(min = 2, max = 30) String displayName) { }
    public record UserView(String username, String displayName, String role) { }
    public record Csrf(String headerName, String parameterName, String token) { }
}
