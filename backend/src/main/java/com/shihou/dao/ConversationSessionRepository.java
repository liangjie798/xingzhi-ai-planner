package com.shihou.dao;
import com.shihou.entity.ConversationSession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface ConversationSessionRepository extends JpaRepository<ConversationSession,String> {
    interface SummaryView {String getId();String getTitle();java.time.Instant getUpdatedAt();}
    List<SummaryView> findByOwnerKeyOrderByUpdatedAtDesc(String owner);
    Optional<ConversationSession> findByIdAndOwnerKey(String id,String owner);
    long countByOwnerKey(String owner);
}
