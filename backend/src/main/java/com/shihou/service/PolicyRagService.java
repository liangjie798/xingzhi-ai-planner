package com.shihou.service;

import com.shihou.dto.EvidenceItem;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** BM25 + local Chinese n-gram vector retrieval fused with RRF. */
@Service
public class PolicyRagService {
    private static final int VECTOR_DIMENSIONS = 384;
    private static final double BM25_K1 = 1.4;
    private static final double BM25_B = 0.72;
    private static final int RRF_K = 60;

    private final ObjectMapper objectMapper;
    private List<PolicyChunk> chunks = List.of();
    private Map<String, Integer> documentFrequency = Map.of();
    private double averageLength = 1.0;

    public PolicyRagService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void loadCorpus() {
        try (InputStream input = new ClassPathResource("knowledge/policy-corpus.json").getInputStream()) {
            List<PolicyChunk> loaded = objectMapper.readValue(input, new TypeReference<>() { });
            if (loaded.isEmpty()) throw new IllegalStateException("policy corpus is empty");
            this.chunks = List.copyOf(loaded);
            buildIndex();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to load policy RAG corpus", exception);
        }
    }

    public List<EvidenceItem> retrieve(String activityType, String group) {
        return retrieve(activityType, group, "", List.of("天气", "空气质量", "活动安全"), 5);
    }

    public List<EvidenceItem> retrieve(String activityType, String group, String region,
                                       List<String> risks, int limit) {
        String query = String.join(" ", List.of(activityType, group, region == null ? "" : region,
                String.join(" ", risks == null ? List.of() : risks), "户外活动 安全 应急 调整时段"));
        List<String> queryTokens = tokens(query);
        double[] queryVector = vector(queryTokens);

        List<ScoredChunk> lexical = chunks.stream()
                .map(chunk -> new ScoredChunk(chunk, bm25(queryTokens, chunk)))
                .sorted(Comparator.comparingDouble(ScoredChunk::score).reversed()).toList();
        List<ScoredChunk> semantic = chunks.stream()
                .map(chunk -> new ScoredChunk(chunk, cosine(queryVector, vector(tokens(searchableText(chunk))))))
                .sorted(Comparator.comparingDouble(ScoredChunk::score).reversed()).toList();

        Map<String, Double> fused = new HashMap<>();
        for (int index = 0; index < lexical.size(); index++)
            fused.merge(lexical.get(index).chunk().id(), 1.0 / (RRF_K + index + 1), Double::sum);
        for (int index = 0; index < semantic.size(); index++)
            fused.merge(semantic.get(index).chunk().id(), 1.0 / (RRF_K + index + 1), Double::sum);
        for (PolicyChunk chunk : chunks)
            fused.merge(chunk.id(), metadataBoost(chunk, activityType, group, region, risks), Double::sum);

        Map<String, PolicyChunk> byId = new LinkedHashMap<>();
        chunks.forEach(chunk -> byId.put(chunk.id(), chunk));
        return fused.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(Math.max(1, Math.min(limit, 8)))
                .map(entry -> toEvidence(byId.get(entry.getKey()), entry.getValue())).toList();
    }

    public int corpusSize() { return chunks.size(); }
    public String mode() { return "hybrid-bm25-local-vector-rrf"; }

    private void buildIndex() {
        Map<String, Integer> frequencies = new HashMap<>();
        int totalLength = 0;
        for (PolicyChunk chunk : chunks) {
            List<String> terms = tokens(searchableText(chunk));
            totalLength += terms.size();
            for (String term : new HashSet<>(terms)) frequencies.merge(term, 1, Integer::sum);
        }
        this.documentFrequency = Map.copyOf(frequencies);
        this.averageLength = Math.max(1.0, (double) totalLength / chunks.size());
    }

    private double bm25(List<String> queryTerms, PolicyChunk chunk) {
        List<String> documentTerms = tokens(searchableText(chunk));
        Map<String, Integer> termFrequency = new HashMap<>();
        documentTerms.forEach(term -> termFrequency.merge(term, 1, Integer::sum));
        double score = 0.0;
        for (String term : new HashSet<>(queryTerms)) {
            int tf = termFrequency.getOrDefault(term, 0);
            if (tf == 0) continue;
            int df = documentFrequency.getOrDefault(term, 0);
            double idf = Math.log(1.0 + (chunks.size() - df + 0.5) / (df + 0.5));
            double denominator = tf + BM25_K1 * (1.0 - BM25_B + BM25_B * documentTerms.size() / averageLength);
            score += idf * (tf * (BM25_K1 + 1.0)) / denominator;
        }
        return score;
    }

    private double metadataBoost(PolicyChunk chunk, String activityType, String group,
                                 String region, List<String> risks) {
        double boost = 0.0;
        if (containsAny(chunk.activityTypes(), activityType)) boost += 0.018;
        if (containsAny(chunk.audiences(), group)) boost += 0.012;
        if (region != null && !region.isBlank() && containsAny(chunk.regions(), region)) boost += 0.010;
        if (risks != null && risks.stream().anyMatch(risk -> containsAny(chunk.risks(), risk))) boost += 0.014;
        if (containsAny(chunk.regions(), "全国")) boost += 0.004;
        return boost;
    }

    private boolean containsAny(List<String> values, String query) {
        if (values == null || query == null || query.isBlank()) return false;
        return values.stream().anyMatch(value -> query.contains(value) || value.contains(query) || "全部".equals(value));
    }

    private String searchableText(PolicyChunk chunk) {
        return String.join(" ", chunk.title(), chunk.publisher(), chunk.section(), chunk.excerpt(),
                String.join(" ", safe(chunk.activityTypes())), String.join(" ", safe(chunk.audiences())),
                String.join(" ", safe(chunk.risks())), String.join(" ", safe(chunk.regions())));
    }

    private List<String> safe(List<String> values) { return values == null ? List.of() : values; }

    private List<String> tokens(String text) {
        String normalized = text == null ? "" : text.toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{IsHan}a-z0-9]+", " ").trim();
        List<String> result = new ArrayList<>();
        for (String segment : normalized.split("\\s+")) {
            if (segment.isBlank()) continue;
            if (segment.matches(".*\\p{IsHan}.*")) {
                int[] points = segment.codePoints().toArray();
                for (int n : List.of(1, 2, 3))
                    for (int index = 0; index + n <= points.length; index++) result.add(new String(points, index, n));
            } else result.add(segment);
        }
        return result;
    }

    private double[] vector(List<String> terms) {
        double[] values = new double[VECTOR_DIMENSIONS];
        for (String term : terms) {
            int hash = term.hashCode();
            values[Math.floorMod(hash, VECTOR_DIMENSIONS)] += (hash & 1) == 0 ? 1.0 : -1.0;
        }
        double norm = Math.sqrt(java.util.Arrays.stream(values).map(value -> value * value).sum());
        if (norm > 0) for (int index = 0; index < values.length; index++) values[index] /= norm;
        return values;
    }

    private double cosine(double[] left, double[] right) {
        double value = 0.0;
        for (int index = 0; index < left.length; index++) value += left[index] * right[index];
        return value;
    }

    private EvidenceItem toEvidence(PolicyChunk chunk, double score) {
        return new EvidenceItem(chunk.id(), chunk.title(), chunk.publisher(), chunk.excerpt(), chunk.tag(),
                chunk.sourceUrl(), chunk.publishedAt(), chunk.section(), Math.round(score * 100000.0) / 100000.0);
    }

    private record ScoredChunk(PolicyChunk chunk, double score) { }
    private record PolicyChunk(String id, String title, String publisher, String publishedAt,
                               String section, String excerpt, String tag, String sourceUrl,
                               List<String> activityTypes, List<String> audiences,
                               List<String> risks, List<String> regions) { }
}
