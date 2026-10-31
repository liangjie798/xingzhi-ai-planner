package com.shihou.controller;

import com.shihou.dao.ConversationSessionRepository;
import com.shihou.dao.UserRepository;
import com.shihou.entity.ConversationSession;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** IDs are always resolved together with the current account/guest owner. */
@RestController
@RequestMapping("/api/v1/conversation-sessions")
public class ConversationSessionController {
    private final ConversationSessionRepository sessions;
    private final UserRepository users;
    private final ObjectMapper mapper;
    public ConversationSessionController(ConversationSessionRepository sessions,UserRepository users,ObjectMapper mapper){this.sessions=sessions;this.users=users;this.mapper=mapper;}
    public record Summary(String id,String title,Instant updatedAt) {}
    private Summary summary(ConversationSession session){return new Summary(session.getId(),session.getTitle(),session.getUpdatedAt());}
    private String owner(Authentication auth,HttpServletRequest request){
        if(auth!=null&&auth.getAuthorities().stream().anyMatch(role->role.getAuthority().equals("ROLE_USER")))return "user:"+users.findByUsername(auth.getName()).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED)).getId();
        var session=request.getSession(true);
        synchronized(session){if(session.getAttribute("conversation-owner")==null)session.setAttribute("conversation-owner",UUID.randomUUID().toString());return "guest:"+session.getAttribute("conversation-owner");}
    }
    private void validate(JsonNode body){if(!body.isObject()||!body.path("messages").isArray()||body.path("messages").size()>1000||body.toString().length()>1000000)throw new IllegalArgumentException("单条对话容量超限，请下载成果后精简记录。");}
    private String title(JsonNode body){for(var message:body.path("messages"))if("user".equals(message.path("role").asText())){String text=message.path("content").asText().strip();if(!text.isEmpty())return text.substring(0,Math.min(36,text.length()));}return "新对话";}
    private ConversationSession find(String id,String owner){return sessions.findByIdAndOwnerKey(id,owner).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));}
    @GetMapping public List<Summary> list(Authentication auth,HttpServletRequest request){return sessions.findByOwnerKeyOrderByUpdatedAtDesc(owner(auth,request)).stream().map(item->new Summary(item.getId(),item.getTitle(),item.getUpdatedAt())).toList();}
    @PostMapping public Summary create(@RequestBody JsonNode body,Authentication auth,HttpServletRequest request){validate(body);String owner=owner(auth,request);if(sessions.countByOwnerKey(owner)>=100)throw new IllegalArgumentException("已保存100条对话，请先整理历史记录。");return summary(sessions.save(new ConversationSession(UUID.randomUUID().toString(),owner,title(body),body.toString())));}
    @GetMapping("/{id}") public JsonNode read(@PathVariable String id,Authentication auth,HttpServletRequest request) throws Exception{return mapper.readTree(find(id,owner(auth,request)).getSnapshot());}
    @PutMapping("/{id}") public synchronized Summary save(@PathVariable String id,@RequestBody JsonNode body,
            @RequestHeader(value="X-Expected-Conversation-Revision",required=false) Long expectedRevision,
            Authentication auth,HttpServletRequest request) throws Exception {
        validate(body);
        var session=find(id,owner(auth,request));
        long current=mapper.readTree(session.getSnapshot()).path("conversationContext").path("revision").asLong(0);
        long incoming=body.path("conversationContext").path("revision").asLong(0);
        if(incoming<current || expectedRevision!=null && expectedRevision!=current)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"对话已有更新，请刷新，未覆盖较新记忆");
        session.update(title(body),body.toString());return summary(sessions.save(session));
    }
    @DeleteMapping("/{id}") public void delete(@PathVariable String id,Authentication auth,HttpServletRequest request){sessions.delete(find(id,owner(auth,request)));}
}
