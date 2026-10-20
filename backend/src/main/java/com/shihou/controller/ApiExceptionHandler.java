package com.shihou.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.shihou.service.EnvironmentService.LiveDataUnavailableException;
import org.springframework.security.core.AuthenticationException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(AuthenticationException.class)
    ProblemDetail handleAuthentication(AuthenticationException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "用户名或密码错误");
        detail.setTitle("登录失败");
        return detail;
    }
    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail handleBadRequest(IllegalArgumentException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        detail.setTitle("请求无法处理");
        return detail;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "活动信息不完整或超出允许范围");
        detail.setTitle("参数校验失败");
        return detail;
    }

    @ExceptionHandler(LiveDataUnavailableException.class)
    ProblemDetail handleLiveDataUnavailable(LiveDataUnavailableException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, exception.getMessage());
        detail.setTitle("实时环境数据暂不可用");
        return detail;
    }
}

