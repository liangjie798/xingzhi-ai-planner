package com.shihou.dao;

import com.shihou.entity.DecisionRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DecisionRecordRepository extends JpaRepository<DecisionRecordEntity, Long> {
    List<DecisionRecordEntity> findTop50ByCreatedByOrderByCreatedAtDesc(String createdBy);
}

