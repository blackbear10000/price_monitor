const tokenModel = require('../../models/token');
const logger = require('../../utils/logger');

// 获取所有代币
exports.getAllTokens = async (req, res) => {
    try {
        const { active, sort, order } = req.query;
        
        const options = {
            active: active === 'true' ? true : (active === 'false' ? false : undefined),
            sort,
            order
        };
        
        const tokens = await tokenModel.getAllTokens(options);
        
        res.json({
            success: true,
            data: tokens
        });
    } catch (error) {
        logger.error(`API - 获取所有代币失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '获取代币列表失败',
            message: error.message
        });
    }
};

// 获取单个代币
exports.getToken = async (req, res) => {
    try {
        const { id } = req.params;
        
        const token = await tokenModel.getToken(id);
        
        if (!token) {
            return res.status(404).json({
                success: false,
                error: '代币不存在',
                message: `代币ID '${id}' 不存在`
            });
        }
        
        res.json({
            success: true,
            data: token
        });
    } catch (error) {
        logger.error(`API - 获取代币失败: ${error.message}`, { id: req.params.id, error });
        res.status(500).json({
            success: false,
            error: '获取代币失败',
            message: error.message
        });
    }
};

// 添加新代币
exports.addToken = async (req, res) => {
    try {
        const { id, symbol, description, priority, isActive } = req.body;
        
        // 验证必填字段
        if (!id || !symbol) {
            return res.status(400).json({
                success: false,
                error: '缺少必填字段',
                message: '代币ID和符号是必填字段'
            });
        }
        
        const tokenData = {
            id,
            symbol,
            description,
            priority,
            isActive
        };
        
        const newToken = await tokenModel.addToken(tokenData);
        
        res.status(201).json({
            success: true,
            data: newToken
        });
    } catch (error) {
        logger.error(`API - 添加代币失败: ${error.message}`, { body: req.body, error });
        
        // 检查是否是重复ID错误
        if (error.message.includes('已存在')) {
            return res.status(409).json({
                success: false,
                error: '代币已存在',
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '添加代币失败',
            message: error.message
        });
    }
};

// 更新代币
exports.updateToken = async (req, res) => {
    try {
        const { id } = req.params;
        const { symbol, description, priority, isActive } = req.body;
        
        const tokenData = {
            symbol,
            description,
            priority,
            isActive
        };
        
        const updatedToken = await tokenModel.updateToken(id, tokenData);
        
        res.json({
            success: true,
            data: updatedToken
        });
    } catch (error) {
        logger.error(`API - 更新代币失败: ${error.message}`, { id: req.params.id, body: req.body, error });
        
        // 检查是否是不存在的代币
        if (error.message.includes('不存在')) {
            return res.status(404).json({
                success: false,
                error: '代币不存在',
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '更新代币失败',
            message: error.message
        });
    }
};

// 删除代币
exports.deleteToken = async (req, res) => {
    try {
        const { id } = req.params;
        
        await tokenModel.deleteToken(id);
        
        res.json({
            success: true,
            message: '代币已删除'
        });
    } catch (error) {
        logger.error(`API - 删除代币失败: ${error.message}`, { id: req.params.id, error });
        
        // 检查是否是不存在的代币
        if (error.message.includes('不存在')) {
            return res.status(404).json({
                success: false,
                error: '代币不存在',
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '删除代币失败',
            message: error.message
        });
    }
};

// 批量添加代币
exports.batchAddTokens = async (req, res) => {
    try {
        const { tokens } = req.body;
        
        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
            return res.status(400).json({
                success: false,
                error: '无效的请求数据',
                message: '请提供有效的代币数组'
            });
        }
        
        const results = await tokenModel.batchAddTokens(tokens);
        
        res.status(201).json({
            success: true,
            data: results
        });
    } catch (error) {
        logger.error(`API - 批量添加代币失败: ${error.message}`, { body: req.body, error });
        res.status(500).json({
            success: false,
            error: '批量添加代币失败',
            message: error.message
        });
    }
};