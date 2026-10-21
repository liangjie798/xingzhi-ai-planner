package com.shihou.config;

import com.shihou.dao.UserRepository;
import com.shihou.entity.UserEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    private final UserRepository users;
    private final PasswordEncoder encoder;

    @Value("${app.admin.username:}") private String username;
    @Value("${app.admin.password:}") private String password;
    @Value("${app.admin.display-name:平台管理员}") private String displayName;
    @Value("${app.super-admin.username:}") private String superUsername;
    @Value("${app.super-admin.password:}") private String superPassword;
    @Value("${app.super-admin.display-name:超级管理员}") private String superDisplayName;

    public AdminBootstrap(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (username.isBlank() || password.isBlank()) {
            log.warn("管理员账户未初始化：请设置 ADMIN_USERNAME 与 ADMIN_PASSWORD");
        } else {
            users.findByUsername(username).orElseGet(() -> {
                log.info("初始化管理员账户 {}", username);
                return users.save(new UserEntity(username, encoder.encode(password), displayName, "ADMIN"));
            });
        }
        if (!superUsername.isBlank() && !superPassword.isBlank()) {
            UserEntity superAdmin = users.findByUsername(superUsername)
                    .orElseGet(() -> new UserEntity(superUsername, encoder.encode(superPassword), superDisplayName, "SUPER_ADMIN"));
            superAdmin.updateAdministrativeAccess(encoder.encode(superPassword), superDisplayName, "SUPER_ADMIN");
            users.save(superAdmin);
            log.info("超级管理员账户 {} 已就绪", superUsername);
        }
    }
}
