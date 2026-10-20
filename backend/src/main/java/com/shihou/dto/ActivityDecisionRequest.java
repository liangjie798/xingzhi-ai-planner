package com.shihou.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ActivityDecisionRequest(
        @NotBlank String cityId,
        @NotBlank String activityType,
        @NotBlank String date,
        String endDate,
        @Min(6) @Max(20) int startHour,
        @Min(1) @Max(8) int duration,
        @Min(1) @Max(100000) int participants,
        @NotBlank String intensity,
        @NotBlank String group,
        @NotBlank String locationName,
        String cityName,
        String province,
        String adcode,
        Double longitude,
        Double latitude,
        @Size(max = 1000) String siteObservation
) {
}

