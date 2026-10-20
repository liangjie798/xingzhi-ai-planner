package com.shihou.dao;

import com.shihou.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface UserRepository extends JpaRepository<UserEntity, Long> {
    Optional<UserEntity> findByUsername(String username);
    List<UserEntity> findAllByOrderByCreatedAtDesc();
    long countByRole(String role);
}
