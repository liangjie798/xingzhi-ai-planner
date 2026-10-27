package com.shihou.config;

import com.shihou.controller.ApiExceptionHandler;
import com.shihou.controller.CityController;
import com.shihou.service.EnvironmentService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CityInputTests {
    @Test void invalidCalendarDateIsAClientErrorAndNeverQueriesWeather() throws Exception {
        var environment = mock(EnvironmentService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new CityController(environment))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        for (String date : new String[]{"2026-02-30", "2026-13-01", "not-a-date"}) {
            mvc.perform(get("/api/v1/cities/hourly").param("cityId", "hangzhou").param("date", date))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("日期无效，请使用存在的日历日期（YYYY-MM-DD）"));
        }
        verifyNoInteractions(environment);
    }
}
