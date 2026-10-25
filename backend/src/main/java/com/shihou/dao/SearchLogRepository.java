package com.shihou.dao;

import com.shihou.entity.SearchLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SearchLogRepository extends JpaRepository<SearchLogEntity, Long> {
    List<SearchLogEntity> findTop100ByOrderByCreatedAtDesc();
    void deleteByUsername(String username);
}
