package com.shihou.config;

import com.shihou.dao.UserRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.security.core.context.SecurityContextHolder;

@Configuration
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    UserDetailsService userDetailsService(UserRepository users) {
        return username -> users.findByUsername(username)
                .map(user -> User.withUsername(user.getUsername())
                        .password(user.getPasswordHash())
                        .roles(user.getRole())
                        .disabled(!user.isEnabled())
                        .build())
                .orElseThrow(() -> new org.springframework.security.core.userdetails.UsernameNotFoundException("用户不存在"));
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, UserRepository users) throws Exception {
        CookieCsrfTokenRepository csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookiePath("/");
        http.addFilterBefore(new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(jakarta.servlet.http.HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response,
                                            jakarta.servlet.FilterChain chain) throws java.io.IOException, jakarta.servlet.ServletException {
                var auth = SecurityContextHolder.getContext().getAuthentication();
                if (auth != null && auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_USER"))
                        && users.findByUsername(auth.getName()).filter(u -> u.isEnabled()).isEmpty()) {
                    if (request.getSession(false) != null) request.getSession(false).invalidate();
                    SecurityContextHolder.clearContext();
                    response.setStatus(401); response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"detail\":\"账户已停用或删除，请重新登录\"}"); return;
                }
                chain.doFilter(request, response);
            }
        }, AuthorizationFilter.class)
                .csrf(value -> value.csrfTokenRepository(csrf)
                        .ignoringRequestMatchers("/api/v1/decisions/**", "/api/v2/agent/**", "/api/v1/analytics/**"))
                .authorizeHttpRequests(value -> value
                        .requestMatchers("/api/v1/auth/me", "/api/v1/auth/csrf", "/api/v1/auth/login", "/api/v1/auth/logout").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/v1/account/**").hasRole("USER")
                        // Administrator sessions are reserved for the separate management console.
                        // User/guest/anonymous business access keeps its existing behavior.
                        .requestMatchers("/api/**").access((authentication, context) -> new AuthorizationDecision(
                                authentication.get().getAuthorities().stream().noneMatch(role ->
                                        role.getAuthority().equals("ROLE_ADMIN") || role.getAuthority().equals("ROLE_SUPER_ADMIN"))))
                        .requestMatchers("/**").permitAll())
                .requestCache(value -> value.disable())
                .formLogin(value -> value.disable())
                .httpBasic(value -> value.disable())
                .logout(value -> value.disable());
        return http.build();
    }
}
