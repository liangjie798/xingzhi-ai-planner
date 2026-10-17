package com.shihou.service;

import com.shihou.dto.EvidenceItem;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PolicyRagService {
    private static final List<EvidenceItem> EVIDENCE = List.of(
            new EvidenceItem("环境空气质量指数（AQI）技术规定", "生态环境主管部门",
                    "活动建议应结合AQI等级、主要污染物与敏感人群特征，不以单一污染物替代综合判断。", "空气质量"),
            new EvidenceItem("高温天气公众健康防护提示", "气象与健康主管部门",
                    "高温时段应减少长时间、高强度户外活动，优先调整至早晚并补充饮水与遮阴。", "高温防护"),
            new EvidenceItem("学校体育活动安全管理要点", "教育主管部门公开资料",
                    "学校体育活动需要结合天气、场地和学生身体状况制定调整及应急预案。", "校园活动")
    );

    public List<EvidenceItem> retrieve(String activityType, String group) {
        if ("校园运动会".equals(activityType) || "体育课".equals(activityType)) return EVIDENCE;
        return EVIDENCE.stream().filter(item -> !"校园活动".equals(item.tag())).toList();
    }
}

