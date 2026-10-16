package com.shihou.dao;

import com.shihou.entity.CityEnvironmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CityEnvironmentRepository extends JpaRepository<CityEnvironmentEntity, String> {
    Optional<CityEnvironmentEntity> findByAdcode(String adcode);
}

