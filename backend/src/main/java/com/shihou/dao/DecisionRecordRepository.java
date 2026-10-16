package com.shihou.dao;

import com.shihou.entity.DecisionRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DecisionRecordRepository extends JpaRepository<DecisionRecordEntity, Long> {
}

