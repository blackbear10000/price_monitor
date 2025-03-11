const logger = require('../../utils/logger');

// 全局错误处理中间件
const errorHandler = (err, req, res, next) => {
    // 记录错误
    logger.error(`API错误: ${err.message}`, {
        error: err,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        body: req.body,
        query: req.query,
        params: req.params
    });
    
    // 确定状态码
    const statusCode = err.statusCode || 500;
    
    // 构建错误响应
    const errorResponse = {
        success: false,
        error: err.name || '服务器错误',
        message: err.message || '处理请求时发生错误'
    };
    
    // 在开发环境中添加堆栈信息
    if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
    }
    
    // 发送错误响应
    res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;