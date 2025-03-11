const alertModel = require('../../models/alert');
const logger = require('../../utils/logger');

// 获取所有告警配置
exports.getAllAlerts = async (req, res) => {
    try {
        const { enabled, type, priority } = req.query;
        
        const options = {
            enabled: enabled === 'true' ? true : (enabled === 'false' ? false : undefined),
            type,
            priority
        };
        
        const alerts = await alertModel.getAllAlerts(options);
        
        res.json({
            success: true,
            data: alerts
        });
    } catch (error) {
        logger.error(`API - 获取所有告警配置失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '获取告警配置失败',
            message: error.message
        });
    }
};

// 获取全局告警配置
exports.getGlobalAlerts = async (req, res) => {
    try {
        const { enabled, type, priority } = req.query;
        
        const options = {
            enabled: enabled === 'true' ? true : (enabled === 'false' ? false : undefined),
            type,
            priority
        };
        
        const alerts = await alertModel.getGlobalAlerts(options);
        
        res.json({
            success: true,
            data: alerts
        });
    } catch (error) {
        logger.error(`API - 获取全局告警配置失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '获取全局告警配置失败',
            message: error.message
        });
    }
};

// 获取特定代币的告警配置
exports.getTokenAlerts = async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled, type, priority } = req.query;
        
        const options = {
            enabled: enabled === 'true' ? true : (enabled === 'false' ? false : undefined),
            type,
            priority
        };
        
        const alerts = await alertModel.getTokenAlerts(id, options);
        
        res.json({
            success: true,
            data: alerts
        });
    } catch (error) {
        logger.error(`API - 获取代币告警配置失败: ${error.message}`, { id: req.params.id, error });
        
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
            error: '获取代币告警配置失败',
            message: error.message
        });
    }
};

// 添加全局告警
exports.addGlobalAlert = async (req, res) => {
    try {
        const alertData = req.body;
        
        // 验证必填字段
        if (!alertData.type || !alertData.condition || alertData.value === undefined) {
            return res.status(400).json({
                success: false,
                error: '缺少必填字段',
                message: '告警类型、条件和值是必填字段'
            });
        }
        
        const newAlert = await alertModel.addGlobalAlert(alertData);
        
        res.status(201).json({
            success: true,
            data: newAlert
        });
    } catch (error) {
        logger.error(`API - 添加全局告警失败: ${error.message}`, { body: req.body, error });
        
        // 检查是否是验证错误
        if (error.message.includes('无效的') || error.message.includes('必须')) {
            return res.status(400).json({
                success: false,
                error: '无效的告警数据',
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '添加全局告警失败',
            message: error.message
        });
    }
};

// 添加特定代币告警
exports.addTokenAlert = async (req, res) => {
    try {
        const { id } = req.params;
        const alertData = req.body;
        
        // 验证必填字段
        if (!alertData.type || !alertData.condition || alertData.value === undefined) {
            return res.status(400).json({
                success: false,
                error: '缺少必填字段',
                message: '告警类型、条件和值是必填字段'
            });
        }
        
        const newAlert = await alertModel.addTokenAlert(id, alertData);
        
        res.status(201).json({
            success: true,
            data: newAlert
        });
    } catch (error) {
        logger.error(`API - 添加代币告警失败: ${error.message}`, { id: req.params.id, body: req.body, error });
        
        // 检查是否是不存在的代币
        if (error.message.includes('不存在')) {
            return res.status(404).json({
                success: false,
                error: '代币不存在',
                message: error.message
            });
        }
        
        // 检查是否是验证错误
        if (error.message.includes('无效的') || error.message.includes('必须')) {
            return res.status(400).json({
                success: false,
                error: '无效的告警数据',
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '添加代币告警失败',
            message: error.message
        });
    }
};

// 更新告警配置
exports.updateAlert = async (req, res) => {
    try {
        const { alertId } = req.params;
        const alertData = req.body;
        
        const updatedAlert = await alertModel.updateAlert(alertId, alertData);
        
        res.json({
            success: true,
            data: updatedAlert
        });
    } catch (error) {
        logger.error(`API - 更新告警配置失败: ${error.message}`, { alertId: req.params.alertId, body: req.body, error });
        
        // 检查是否是不存在的告警
        if (error.message.includes('不存在')) {
            return res.status(404).json({
                success: false,
                error: '告警不存在',
                message: error.message
            });
        }
        
        // 检查是否是验证错误
        if (error.message.includes('无效的') || error.message.includes('必须')) {
            return res.status(400).json({
                success: false,
                error: '无效的告警数据',
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '更新告警配置失败',
            message: error.message
        });
    }
};

// 删除告警配置
exports.deleteAlert = async (req, res) => {
    try {
        const { alertId } = req.params;
        
        await alertModel.deleteAlert(alertId);
        
        res.json({
            success: true,
            message: '告警已删除'
        });
    } catch (error) {
        logger.error(`API - 删除告警配置失败: ${error.message}`, { alertId: req.params.alertId, error });
        
        // 检查是否是不存在的告警
        if (error.message.includes('不存在')) {
            return res.status(404).json({
                success: false,
                error: '告警不存在',
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '删除告警配置失败',
            message: error.message
        });
    }
};

// 批量添加告警
exports.batchAddAlerts = async (req, res) => {
    try {
        const alertsData = req.body;
        
        if (!alertsData.global && !alertsData.tokens) {
            return res.status(400).json({
                success: false,
                error: '无效的请求数据',
                message: '请提供全局告警或代币特定告警数据'
            });
        }
        
        const results = await alertModel.batchAddAlerts(alertsData);
        
        res.status(201).json({
            success: true,
            data: results
        });
    } catch (error) {
        logger.error(`API - 批量添加告警失败: ${error.message}`, { body: req.body, error });
        res.status(500).json({
            success: false,
            error: '批量添加告警失败',
            message: error.message
        });
    }
};

// 获取告警历史记录
exports.getAlertHistory = async (req, res) => {
    try {
        const { start, end, tokenId, type, priority, limit, offset } = req.query;
        
        const options = {
            start,
            end,
            tokenId,
            type,
            priority,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined
        };
        
        const history = await alertModel.getAlertHistory(options);
        
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        logger.error(`API - 获取告警历史记录失败: ${error.message}`, { query: req.query, error });
        res.status(500).json({
            success: false,
            error: '获取告警历史记录失败',
            message: error.message
        });
    }
};

// 获取特定代币的告警历史
exports.getTokenAlertHistory = async (req, res) => {
    try {
        const { tokenId } = req.params;
        const { start, end, type, priority, limit, offset } = req.query;
        
        const options = {
            start,
            end,
            tokenId,
            type,
            priority,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined
        };
        
        const history = await alertModel.getAlertHistory(options);
        
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        logger.error(`API - 获取代币告警历史记录失败: ${error.message}`, { tokenId: req.params.tokenId, query: req.query, error });
        res.status(500).json({
            success: false,
            error: '获取代币告警历史记录失败',
            message: error.message
        });
    }
};

// 获取告警统计数据
exports.getAlertStatistics = async (req, res) => {
    try {
        const { period } = req.query;
        
        const statistics = await alertModel.getAlertStatistics(period);
        
        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        logger.error(`API - 获取告警统计数据失败: ${error.message}`, { period: req.query.period, error });
        res.status(500).json({
            success: false,
            error: '获取告警统计数据失败',
            message: error.message
        });
    }
};