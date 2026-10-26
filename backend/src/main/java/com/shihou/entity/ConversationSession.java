package com.shihou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name="conversation_session", indexes=@Index(name="idx_conversation_owner",columnList="owner_key"))
public class ConversationSession {
    @Id private String id;
    @Column(name="owner_key",nullable=false,length=100) private String ownerKey;
    @Column(nullable=false,length=100) private String title;
    @Lob @Column(columnDefinition="MEDIUMTEXT",nullable=false) private String snapshot;
    private Instant updatedAt;
    protected ConversationSession() {}
    public ConversationSession(String id,String owner,String title,String snapshot) {this.id=id;this.ownerKey=owner;update(title,snapshot);}
    public void update(String title,String snapshot) {this.title=title;this.snapshot=snapshot;this.updatedAt=Instant.now();}
    public String getId(){return id;}
    public String getTitle(){return title;}
    public String getSnapshot(){return snapshot;}
    public Instant getUpdatedAt(){return updatedAt;}
}
