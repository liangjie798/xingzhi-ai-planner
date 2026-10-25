package com.shihou.dao;

import com.shihou.entity.FeedbackEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FeedbackRepository extends JpaRepository<FeedbackEntity, Long> {
    List<FeedbackEntity> findTop200ByOrderByCreatedAtDesc();
    List<FeedbackEntity> findTop50ByUsernameOrderByCreatedAtDesc(String username);
    void deleteByUsername(String username);
}
