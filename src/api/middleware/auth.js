const config = require('../../config');
const logger = require('../../utils/logger');

// API密钥认证中间件
const apiKeyAuth = (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        
        // 检查API密钥是否存在
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: '未授权',
                message: '缺少API密钥'
            });
        }
        
        // 检查API密钥是否有效
        if (apiKey !== config.apiKey) {
            logger.warn(`无效的API密钥尝试: ${req.ip}`);
            return res.status(401).json({
                success: false,
                error: '未授权',
                message: '无效的API密钥'
            });
        }
        
        // 认证通过
        next();
    } catch (error) {
        logger.error(`认证中间件错误: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '服务器错误',
            message: '认证过程中发生错误'
        });
    }
};

module.exports = apiKeyAuth;