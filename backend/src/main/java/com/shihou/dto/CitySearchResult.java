package com.shihou.dto;

public record CitySearchResult(
        String id,
        String name,
        String province,
        String district,
        String adcode,
        double longitude,
        double latitude
) { }
