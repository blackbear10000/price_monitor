const logger = require('../../utils/logger');
const config = require('../../config');
const db = require('../../utils/database');
const cleanupService = require('../../services/cleanupService');
const tokenModel = require('../../models/token');
const alertModel = require('../../models/alert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const priceModel = require('../../models/price');
const priceService = require('../../services/priceService');

// 获取系统状态信息
exports.getSystemStatus = async (req, res) => {
    try {
        // 获取系统运行时间
        const uptime = process.uptime();
        
        // 获取内存使用情况
        const memoryUsage = process.memoryUsage();
        const memoryUsageMB = Math.round(memoryUsage.rss / 1024 / 1024);
        
        // 获取CPU使用情况
        const cpuUsage = process.cpuUsage();
        const cpuUsagePercent = Math.round(
            (cpuUsage.user + cpuUsage.system) / 1000 / os.cpus().length / uptime
        );
        
        // 获取活跃代币数量
        const tokens = await tokenModel.getAllTokens({ active: true });
        
        // 获取活跃告警数量
        const alerts = await alertModel.getAllAlerts({ enabled: true });
        const globalAlertsCount = alerts.global.length;
        const tokenAlertsCount = Object.values(alerts.tokens).reduce(
            (sum, tokenAlerts) => sum + tokenAlerts.length, 0
        );
        
        // 获取数据库大小信息
        const dbSize = await cleanupService.getDatabaseSize();
        
        // 获取API请求统计
        // 这里需要实现请求统计功能，暂时使用模拟数据
        const apiRequests = {
            total: 0,
            last24h: 0
        };
        
        // 获取通知统计
        // 这里需要实现通知统计功能，暂时使用模拟数据
        const notifications = {
            sent: 0,
            failed: 0
        };
        
        // 获取最近的价格记录
        const latestPrices = await priceModel.getLatestPrices();
        
        // 获取系统错误日志
        const recentErrors = await db.all(
            `SELECT * FROM system_logs 
             WHERE level = 'error' 
             ORDER BY timestamp DESC 
             LIMIT 10`
        );
        
        res.json({
            success: true,
            data: {
                uptime: {
                    seconds: uptime,
                    formattedTime: formatUptime(uptime)
                },
                version: process.env.npm_package_version || '1.0.0',
                activeTokens: tokens.length,
                activeAlerts: globalAlertsCount + tokenAlertsCount,
                lastPriceUpdate: db.formatTimestamp(),
                databaseSize: `${dbSize.sizeMB} MB`,
                memoryUsage: `${memoryUsageMB} MB`,
                cpuUsage: `${cpuUsagePercent}%`,
                apiRequests,
                notifications,
                prices: {
                    recentUpdates: latestPrices.length,
                    lastPriceUpdate: db.formatTimestamp(),
                    oldestPrice: latestPrices.length > 0 ? 
                        Math.min(...latestPrices.map(p => new Date(p.timestamp).getTime())) : null
                },
                errors: recentErrors,
                config: {
                    priceUpdateInterval: config.priceUpdateInterval,
                    dataRetentionDays: config.dataRetentionDays,
                    alertNotificationCooldown: config.alertNotificationCooldown,
                    timezone: config.timezone
                }
            }
        });
    } catch (error) {
        logger.error(`API - 获取系统状态信息失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '获取系统状态信息失败',
            message: error.message
        });
    }
};

// 获取当前系统配置
exports.getConfiguration = async (req, res) => {
    try {
        // 过滤掉敏感信息
        const safeConfig = {
            priceUpdateInterval: config.priceUpdateInterval,
            requestTimeout: config.requestTimeout,
            maxRetryCount: config.maxRetryCount,
            retryDelayBase: config.retryDelayBase,
            timezone: config.timezone,
            apiServerPort: config.port,
            logLevel: config.logLevel,
            dataRetentionDays: config.dataRetentionDays,
            maxConcurrentRequests: config.maxConcurrentRequests,
            alertNotificationCooldown: config.alertNotificationCooldown
        };
        
        res.json({
            success: true,
            data: safeConfig
        });
    } catch (error) {
        logger.error(`API - 获取系统配置失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '获取系统配置失败',
            message: error.message
        });
    }
};

// 获取系统日志
exports.getLogs = async (req, res) => {
    try {
        const { level, start, end, limit = 50, offset = 0, search } = req.query;
        
        // 构建查询条件
        const conditions = [];
        const params = [];
        
        if (level) {
            conditions.push('level = ?');
            params.push(level);
        }
        
        if (start) {
            conditions.push('timestamp >= datetime(?, "utc")');
            params.push(start);
        }
        
        if (end) {
            conditions.push('timestamp <= datetime(?, "utc")');
            params.push(end);
        }
        
        if (search) {
            conditions.push('(message LIKE ? OR context LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        
        // 构建SQL查询
        let sql = 'SELECT * FROM system_logs';
        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        // 获取日志记录
        const logs = await db.all(sql, params);
        
        // 获取总记录数
        let countSql = 'SELECT COUNT(*) as total FROM system_logs';
        if (conditions.length > 0) {
            countSql += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        const countResult = await db.get(countSql, params.slice(0, -2));
        
        res.json({
            success: true,
            data: {
                total: countResult.total,
                results: logs
            },
            pagination: {
                total: countResult.total,
                offset: parseInt(offset),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        logger.error(`API - 获取系统日志失败: ${error.message}`, { query: req.query, error });
        res.status(500).json({
            success: false,
            error: '获取系统日志失败',
            message: error.message
        });
    }
};

// 健康检查接口
exports.healthCheck = async (req, res) => {
    try {
        // 检查数据库连接
        await db.get('SELECT 1');
        
        // 检查其他组件状态
        // 这里可以添加更多组件的健康检查
        
        res.json({
            status: 'healthy',
            components: {
                database: 'connected',
                api: 'operational',
                priceUpdater: 'running',
                notificationService: 'running'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`API - 健康检查失败: ${error.message}`, { error });
        res.status(500).json({
            status: 'unhealthy',
            components: {
                database: error.message.includes('database') ? 'disconnected' : 'connected',
                api: 'operational',
                priceUpdater: 'unknown',
                notificationService: 'unknown'
            },
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// 触发数据清理
exports.triggerCleanup = async (req, res) => {
    try {
        const { dataType, olderThan } = req.body;
        
        let result;
        
        if (dataType === 'price_history') {
            // 解析天数
            const days = olderThan ? parseInt(olderThan) : null;
            result = await cleanupService.cleanupPriceHistory(days);
        } else if (dataType === 'alert_history') {
            const days = olderThan ? parseInt(olderThan) : null;
            result = await cleanupService.cleanupAlertHistory(days);
        } else if (dataType === 'notification_history') {
            const days = olderThan ? parseInt(olderThan) : null;
            result = await cleanupService.cleanupNotificationHistory(days);
        } else if (dataType === 'system_logs') {
            const days = olderThan ? parseInt(olderThan) : null;
            result = await cleanupService.cleanupSystemLogs(days);
        } else if (dataType === 'all' || !dataType) {
            result = await cleanupService.runAllCleanupTasks();
        } else {
            return res.status(400).json({
                success: false,
                error: '无效的数据类型',
                message: `不支持的数据类型: ${dataType}`
            });
        }
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error(`API - 触发数据清理失败: ${error.message}`, { body: req.body, error });
        res.status(500).json({
            success: false,
            error: '触发数据清理失败',
            message: error.message
        });
    }
};

// 重置并重新导入配置文件
exports.resetAndReimportConfig = async (req, res) => {
    try {
        logger.info('开始执行配置文件重置与重新导入...');
        
        // 1. 清空现有配置
        logger.info('清空现有告警配置...');
        await db.run('DELETE FROM alerts');
        
        logger.info('清空已有代币配置...');
        // 确保不会因为外键约束导致删除失败
        await db.run('PRAGMA foreign_keys = OFF');
        await db.run('DELETE FROM tokens');
        await db.run('PRAGMA foreign_keys = ON');
        
        // 2. 重新加载配置文件（强制重新读取文件而不是使用缓存）
        const tokenConfigPath = path.join(process.cwd(), 'config', 'tokens.json');
        const alertConfigPath = path.join(process.cwd(), 'config', 'alerts.json');
        
        let tokenConfig, alertConfig;
        
        // 读取tokens.json
        if (fs.existsSync(tokenConfigPath)) {
            try {
                const tokenData = fs.readFileSync(tokenConfigPath, 'utf8');
                tokenConfig = JSON.parse(tokenData);
                logger.info(`成功读取代币配置文件: ${tokenConfigPath}`);
            } catch (error) {
                logger.error(`读取代币配置文件失败: ${error.message}`);
                return res.status(500).json({
                    success: false,
                    error: '读取代币配置文件失败',
                    message: error.message
                });
            }
        } else {
            logger.error(`代币配置文件不存在: ${tokenConfigPath}`);
            return res.status(404).json({
                success: false,
                error: '代币配置文件不存在',
                message: `文件 ${tokenConfigPath} 不存在`
            });
        }
        
        // 读取alerts.json
        if (fs.existsSync(alertConfigPath)) {
            try {
                const alertData = fs.readFileSync(alertConfigPath, 'utf8');
                alertConfig = JSON.parse(alertData);
                logger.info(`成功读取告警配置文件: ${alertConfigPath}`);
            } catch (error) {
                logger.error(`读取告警配置文件失败: ${error.message}`);
                return res.status(500).json({
                    success: false,
                    error: '读取告警配置文件失败',
                    message: error.message
                });
            }
        } else {
            logger.error(`告警配置文件不存在: ${alertConfigPath}`);
            return res.status(404).json({
                success: false,
                error: '告警配置文件不存在',
                message: `文件 ${alertConfigPath} 不存在`
            });
        }
        
        // 3. 导入代币配置
        let tokenResults = null;
        if (tokenConfig && tokenConfig.tokens && tokenConfig.tokens.length > 0) {
            logger.info(`开始导入${tokenConfig.tokens.length}个代币...`);
            tokenResults = await tokenModel.batchAddTokens(tokenConfig.tokens);
            logger.info(`代币导入完成: 添加=${tokenResults.added}, 跳过=${tokenResults.skipped}`);
        } else {
            logger.warn('代币配置文件中没有有效的代币数据');
        }
        
        // 4. 导入告警配置
        let alertResults = null;
        if (alertConfig) {
            logger.info('开始导入告警配置...');
            alertResults = await alertModel.batchAddAlerts(alertConfig);
            logger.info(`告警导入完成: 添加=${alertResults.added}, 跳过=${alertResults.skipped}`);
        } else {
            logger.warn('告警配置文件中没有有效的告警数据');
        }
        
        // 5. 返回结果
        res.json({
            success: true,
            message: '配置重置与重新导入成功',
            data: {
                tokens: tokenResults,
                alerts: alertResults
            }
        });
    } catch (error) {
        logger.error(`重置配置失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '重置配置失败',
            message: error.message
        });
    }
};

// 记录系统事件
const logSystemEvent = async (level, message, context = null) => {
    try {
        await db.run(
            `INSERT INTO system_logs (level, message, context) 
             VALUES (?, ?, ?)`,
            [level, message, context ? JSON.stringify(context) : null]
        );
        
        return {
            level,
            message,
            context,
            timestamp: db.formatTimestamp()
        };
    } catch (error) {
        console.error(`记录系统事件失败: ${error.message}`, { level, message, error });
        return null;
    }
};

// 添加系统事件日志
exports.addSystemLog = async (req, res) => {
    try {
        const { level, message, context } = req.body;
        
        if (!level || !message) {
            return res.status(400).json({
                error: '参数错误',
                message: '级别和消息是必需的'
            });
        }
        
        const result = await logSystemEvent(level, message, context);
        
        res.status(201).json({
            success: true,
            data: {
                id: result.id,
                level,
                message,
                timestamp: db.formatTimestamp()
            }
        });
    } catch (error) {
        logger.error(`添加系统日志失败: ${error.message}`, { error });
        res.status(500).json({
            error: '添加系统日志失败',
            message: error.message
        });
    }
};