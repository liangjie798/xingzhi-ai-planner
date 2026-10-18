package com.shihou.dto;

/** A policy excerpt with enough metadata for users to verify the source. */
public record EvidenceItem(
        String id,
        String title,
        String publisher,
        String excerpt,
        String tag,
        String sourceUrl,
        String publishedAt,
        String section,
        double retrievalScore
) {
    public EvidenceItem(String title, String publisher, String excerpt, String tag) {
        this(title, title, publisher, excerpt, tag, "", "", "", 0.0);
    }
}

