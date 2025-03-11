const logger = require('../../utils/logger');

// 简单的内存限流实现
class RateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000; // 默认1分钟窗口
        this.maxRequests = options.maxRequests || 100; // 默认每个窗口最多100个请求
        this.message = options.message || '请求过于频繁，请稍后再试';
        this.statusCode = options.statusCode || 429;
        this.requestCounts = new Map();
        
        // 定期清理过期的请求记录
        setInterval(() => this.cleanup(), this.windowMs);
    }
    
    // 清理过期的请求记录
    cleanup() {
        const now = Date.now();
        for (const [key, data] of this.requestCounts.entries()) {
            if (now - data.timestamp > this.windowMs) {
                this.requestCounts.delete(key);
            }
        }
    }
    
    // 获取请求的唯一标识
    getKey(req) {
        // 默认使用IP地址作为标识
        return req.ip || req.connection.remoteAddress;
    }
    
    // 中间件函数
    middleware() {
        return (req, res, next) => {
            try {
                const key = this.getKey(req);
                const now = Date.now();
                
                // 获取或创建请求记录
                if (!this.requestCounts.has(key)) {
                    this.requestCounts.set(key, {
                        count: 0,
                        timestamp: now
                    });
                }
                
                const data = this.requestCounts.get(key);
                
                // 如果时间窗口已过期，重置计数
                if (now - data.timestamp > this.windowMs) {
                    data.count = 0;
                    data.timestamp = now;
                }
                
                // 增加请求计数
                data.count++;
                
                // 检查是否超过限制
                if (data.count > this.maxRequests) {
                    logger.warn(`请求限流触发: ${key}, 计数=${data.count}`);
                    return res.status(this.statusCode).json({
                        success: false,
                        error: '请求过于频繁',
                        message: this.message
                    });
                }
                
                next();
            } catch (error) {
                logger.error(`限流中间件错误: ${error.message}`, { error });
                next();
            }
        };
    }
}

// 创建默认限流器
const defaultRateLimiter = new RateLimiter();

module.exports = {
    RateLimiter,
    defaultLimiter: defaultRateLimiter.middleware()
};