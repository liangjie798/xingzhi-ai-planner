package com.shihou.controller;

import com.shihou.dao.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final UserRepository users;
    private final HttpSessionSecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(AuthenticationManager authenticationManager, UserRepository users) {
        this.authenticationManager = authenticationManager;
        this.users = users;
    }

    @GetMapping("/csrf")
    public Csrf csrf(CsrfToken token) { return new Csrf(token.getHeaderName(), token.getParameterName(), token.getToken()); }

    @PostMapping("/login")
    public UserView login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(body.username(), body.password()));
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        return current(authentication);
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
        var user = users.findByUsername(authentication.getName()).orElseThrow();
        return new UserView(user.getUsername(), user.getDisplayName(), user.getRole());
    }

    public record LoginRequest(@NotBlank @Size(max = 64) String username,
                               @NotBlank @Size(max = 128) String password) { }
    public record UserView(String username, String displayName, String role) { }
    public record Csrf(String headerName, String parameterName, String token) { }
}
