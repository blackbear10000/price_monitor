const db = require('../utils/database');
const logger = require('../utils/logger');
const tokenModel = require('./token');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

class AlertModel {
    // 获取所有告警配置
    async getAllAlerts(options = {}) {
        try {
            const { enabled, type, priority } = options;
            
            // 获取全局告警
            let globalSql = 'SELECT * FROM alerts WHERE token_id IS NULL';
            const globalParams = [];
            
            if (enabled !== undefined) {
                globalSql += ' AND enabled = ?';
                globalParams.push(enabled ? 1 : 0);
            }
            
            if (type) {
                globalSql += ' AND type = ?';
                globalParams.push(type);
            }
            
            if (priority) {
                globalSql += ' AND priority = ?';
                globalParams.push(priority);
            }
            
            const globalAlerts = await db.all(globalSql, globalParams);
            
            // 获取代币特定告警
            let tokenSql = 'SELECT * FROM alerts WHERE token_id IS NOT NULL';
            const tokenParams = [];
            
            if (enabled !== undefined) {
                tokenSql += ' AND enabled = ?';
                tokenParams.push(enabled ? 1 : 0);
            }
            
            if (type) {
                tokenSql += ' AND type = ?';
                tokenParams.push(type);
            }
            
            if (priority) {
                tokenSql += ' AND priority = ?';
                tokenParams.push(priority);
            }
            
            const tokenAlerts = await db.all(tokenSql, tokenParams);
            
            // 按代币ID分组
            const tokenAlertsMap = {};
            for (const alert of tokenAlerts) {
                if (!tokenAlertsMap[alert.token_id]) {
                    tokenAlertsMap[alert.token_id] = [];
                }
                tokenAlertsMap[alert.token_id].push(this.formatAlert(alert));
            }
            
            return {
                global: globalAlerts.map(alert => this.formatAlert(alert)),
                tokens: tokenAlertsMap
            };
        } catch (error) {
            logger.error(`获取所有告警配置失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 获取全局告警配置
    async getGlobalAlerts(options = {}) {
        try {
            const { enabled, type, priority } = options;
            
            let sql = 'SELECT * FROM alerts WHERE token_id IS NULL';
            const params = [];
            
            if (enabled !== undefined) {
                sql += ' AND enabled = ?';
                params.push(enabled ? 1 : 0);
            }
            
            if (type) {
                sql += ' AND type = ?';
                params.push(type);
            }
            
            if (priority) {
                sql += ' AND priority = ?';
                params.push(priority);
            }
            
            const alerts = await db.all(sql, params);
            
            return alerts.map(alert => this.formatAlert(alert));
        } catch (error) {
            logger.error(`获取全局告警配置失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 获取代币特定告警配置
    async getTokenAlerts(tokenId, options = {}) {
        try {
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            const { enabled, type, priority } = options;
            
            let sql = 'SELECT * FROM alerts WHERE token_id = ?';
            const params = [tokenId];
            
            if (enabled !== undefined) {
                sql += ' AND enabled = ?';
                params.push(enabled ? 1 : 0);
            }
            
            if (type) {
                sql += ' AND type = ?';
                params.push(type);
            }
            
            if (priority) {
                sql += ' AND priority = ?';
                params.push(priority);
            }
            
            const alerts = await db.all(sql, params);
            
            return alerts.map(alert => this.formatAlert(alert));
        } catch (error) {
            logger.error(`获取代币告警配置失败: ${error.message}`, { tokenId, error });
            throw error;
        }
    }
    
    // 获取单个告警配置
    async getAlert(alertId) {
        try {
            const alert = await db.get('SELECT * FROM alerts WHERE id = ?', [alertId]);
            
            if (!alert) {
                return null;
            }
            
            return this.formatAlert(alert);
        } catch (error) {
            logger.error(`获取告警配置失败: ${error.message}`, { alertId, error });
            throw error;
        }
    }
    
    // 添加全局告警
    async addGlobalAlert(alertData) {
        try {
            const {
                type,
                condition,
                value,
                timeframe,
                enabled = true,
                oneTime = false,
                cooldown = 3600,
                priority = 'medium',
                description
            } = alertData;
            
            // 验证告警类型
            if (!['price', 'percentage'].includes(type)) {
                throw new Error('无效的告警类型');
            }
            
            // 验证条件
            if (!['above', 'below', 'increase', 'decrease'].includes(condition)) {
                throw new Error('无效的告警条件');
            }
            
            // 验证值
            if (typeof value !== 'number' || value <= 0) {
                throw new Error('告警值必须是正数');
            }
            
            // 验证时间窗口（仅百分比类型需要）
            if (type === 'percentage' && (!timeframe || timeframe <= 0)) {
                throw new Error('百分比告警必须指定有效的时间窗口');
            }
            
            // 生成唯一ID
            const id = uuidv4();
            
            // 准备条件JSON
            const conditionJson = JSON.stringify({
                type,
                condition,
                value,
                ...(type === 'percentage' && { timeframe })
            });
            
            // 插入告警配置
            await db.run(
                `INSERT INTO alerts (
                    id, token_id, type, condition_json, enabled, one_time, 
                    cooldown, priority, description, created_at
                ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, datetime("now", "utc"))`,
                [id, type, conditionJson, enabled ? 1 : 0, oneTime ? 1 : 0, 
                 cooldown, priority, description]
            );
            
            logger.info(`添加全局告警成功: ${type} ${condition} ${value}`);
            
            return {
                id,
                type,
                condition,
                value,
                ...(type === 'percentage' && { timeframe }),
                enabled,
                oneTime,
                cooldown,
                priority,
                description,
                createdAt: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`添加全局告警失败: ${error.message}`, { alertData, error });
            throw error;
        }
    }
    
    // 添加代币特定告警
    async addTokenAlert(tokenId, alertData) {
        try {
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            const {
                type,
                condition,
                value,
                timeframe,
                enabled = true,
                oneTime = false,
                cooldown = 3600,
                priority = 'medium',
                description
            } = alertData;
            
            // 验证告警类型
            if (!['price', 'percentage'].includes(type)) {
                throw new Error('无效的告警类型');
            }
            
            // 验证条件
            if (!['above', 'below', 'increase', 'decrease'].includes(condition)) {
                throw new Error('无效的告警条件');
            }
            
            // 验证值
            if (typeof value !== 'number' || value <= 0) {
                throw new Error('告警值必须是正数');
            }
            
            // 验证时间窗口（仅百分比类型需要）
            if (type === 'percentage' && (!timeframe || timeframe <= 0)) {
                throw new Error('百分比告警必须指定有效的时间窗口');
            }
            
            // 生成唯一ID
            const id = uuidv4();
            
            // 准备条件JSON
            const conditionJson = JSON.stringify({
                type,
                condition,
                value,
                ...(type === 'percentage' && { timeframe })
            });
            
            // 插入告警配置
            await db.run(
                `INSERT INTO alerts (
                    id, token_id, type, condition_json, enabled, one_time, 
                    cooldown, priority, description, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now", "utc"))`,
                [id, tokenId, type, conditionJson, enabled ? 1 : 0, oneTime ? 1 : 0, 
                 cooldown, priority, description]
            );
            
            logger.info(`添加代币告警成功: ${tokenId} ${type} ${condition} ${value}`);
            
            return {
                id,
                tokenId,
                type,
                condition,
                value,
                ...(type === 'percentage' && { timeframe }),
                enabled,
                oneTime,
                cooldown,
                priority,
                description,
                createdAt: db.formatTimestamp()
            };
        } catch (error) {
            logger.error(`添加代币告警失败: ${error.message}`, { tokenId, alertData, error });
            throw error;
        }
    }
    
    // 更新告警配置
    async updateAlert(alertId, alertData) {
        try {
            // 检查告警是否存在
            const existingAlert = await this.getAlert(alertId);
            if (!existingAlert) {
                throw new Error(`告警ID '${alertId}' 不存在`);
            }
            
            const {
                type,
                condition,
                value,
                timeframe,
                enabled,
                oneTime,
                cooldown,
                priority,
                description,
                lastTriggered
            } = alertData;
            
            // 构建更新字段
            const updates = [];
            const params = [];
            
            // 如果更新了条件相关字段，需要重新构建条件JSON
            if (type !== undefined || condition !== undefined || value !== undefined || timeframe !== undefined) {
                const newType = type || existingAlert.type;
                const newCondition = condition || existingAlert.condition;
                const newValue = value !== undefined ? value : existingAlert.value;
                const newTimeframe = timeframe !== undefined ? timeframe : existingAlert.timeframe;
                
                // 验证告警类型
                if (!['price', 'percentage'].includes(newType)) {
                    throw new Error('无效的告警类型');
                }
                
                // 验证条件
                if (!['above', 'below', 'increase', 'decrease'].includes(newCondition)) {
                    throw new Error('无效的告警条件');
                }
                
                // 验证值
                if (typeof newValue !== 'number' || newValue <= 0) {
                    throw new Error('告警值必须是正数');
                }
                
                // 验证时间窗口（仅百分比类型需要）
                if (newType === 'percentage' && (!newTimeframe || newTimeframe <= 0)) {
                    throw new Error('百分比告警必须指定有效的时间窗口');
                }
                
                // 准备新的条件JSON
                const conditionJson = JSON.stringify({
                    type: newType,
                    condition: newCondition,
                    value: newValue,
                    ...(newType === 'percentage' && { timeframe: newTimeframe })
                });
                
                updates.push('type = ?');
                params.push(newType);
                
                updates.push('condition_json = ?');
                params.push(conditionJson);
            }
            
            if (enabled !== undefined) {
                updates.push('enabled = ?');
                params.push(enabled ? 1 : 0);
            }
            
            if (oneTime !== undefined) {
                updates.push('one_time = ?');
                params.push(oneTime ? 1 : 0);
            }
            
            if (cooldown !== undefined) {
                updates.push('cooldown = ?');
                params.push(cooldown);
            }
            
            if (priority !== undefined) {
                updates.push('priority = ?');
                params.push(priority);
            }
            
            if (description !== undefined) {
                updates.push('description = ?');
                params.push(description);
            }
            
            // 处理最后触发时间
            if (lastTriggered !== undefined) {
                updates.push('last_triggered = ?');
                params.push(lastTriggered);
            }
            
            if (updates.length === 0) {
                return existingAlert;
            }
            
            // 添加最后更新时间
            updates.push('updated_at = datetime("now", "utc")');
            
            // 添加ID参数
            params.push(alertId);
            
            await db.run(
                `UPDATE alerts SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
            
            logger.info(`更新告警配置成功: ${alertId}`);
            
            // 获取更新后的告警
            return await this.getAlert(alertId);
        } catch (error) {
            logger.error(`更新告警配置失败: ${error.message}`, { alertId, alertData, error });
            throw error;
        }
    }
    
    // 删除告警配置
    async deleteAlert(alertId) {
        try {
            // 检查告警是否存在
            const existingAlert = await this.getAlert(alertId);
            if (!existingAlert) {
                throw new Error(`告警ID '${alertId}' 不存在`);
            }
            
            await db.run('DELETE FROM alerts WHERE id = ?', [alertId]);
            
            logger.info(`删除告警配置成功: ${alertId}`);
            
            return true;
        } catch (error) {
            logger.error(`删除告警配置失败: ${error.message}`, { alertId, error });
            throw error;
        }
    }
    
    // 批量添加告警
    async batchAddAlerts(alertsData) {
        try {
            const results = {
                added: 0,
                skipped: 0,
                alerts: []
            };
            
            // 处理全局告警
            if (alertsData.global && Array.isArray(alertsData.global)) {
                for (const alertData of alertsData.global) {
                    try {
                        const addedAlert = await this.addGlobalAlert(alertData);
                        results.added++;
                        results.alerts.push(addedAlert);
                    } catch (error) {
                        logger.warn(`批量添加全局告警时跳过: ${error.message}`, { alertData });
                        results.skipped++;
                    }
                }
            }
            
            // 处理代币特定告警
            if (alertsData.tokens && typeof alertsData.tokens === 'object') {
                for (const [tokenId, tokenAlerts] of Object.entries(alertsData.tokens)) {
                    if (Array.isArray(tokenAlerts)) {
                        for (const alertData of tokenAlerts) {
                            try {
                                const addedAlert = await this.addTokenAlert(tokenId, alertData);
                                results.added++;
                                results.alerts.push(addedAlert);
                            } catch (error) {
                                logger.warn(`批量添加代币告警时跳过: ${error.message}`, { tokenId, alertData });
                                results.skipped++;
                            }
                        }
                    }
                }
            }
            
            logger.info(`批量添加告警完成: 添加=${results.added}, 跳过=${results.skipped}`);
            
            return results;
        } catch (error) {
            logger.error(`批量添加告警失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 记录告警触发事件
    async recordAlertTrigger(alertId, tokenId, alertType, condition, triggerValue, currentValue, priority = 'medium', description = null) {
        try {
            // 准备trigger_value字段
            let triggerValueForDB = triggerValue;
            
            // 如果是对象，转换为JSON字符串
            if (typeof triggerValue === 'object') {
                triggerValueForDB = JSON.stringify(triggerValue);
            }
            
            // 插入告警记录
            const result = await db.run(
                `INSERT INTO alert_records (
                    alert_id, token_id, alert_type, condition, 
                    trigger_value, current_value, priority, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [alertId, tokenId, alertType, condition, 
                 triggerValueForDB, currentValue, priority, description]
            );
            
            // 同时更新代币特定的最后触发时间
            const now = moment.utc().format('YYYY-MM-DD HH:mm:ss');
            await this.updateAlertTokenLastTriggered(alertId, tokenId, now);
            
            logger.info(`告警触发记录已添加并更新代币特定的最后触发时间: ${alertId} ${tokenId} ${alertType} ${condition}`);
            
            return {
                id: result.lastID,
                alertId,
                tokenId,
                alertType,
                condition,
                triggerValue,
                currentValue,
                priority,
                description,
                triggeredAt: db.formatTimestamp(),
                notificationSent: false
            };
        } catch (error) {
            logger.error(`添加告警记录失败: ${error.message}`, { 
                alertId, tokenId, alertType, condition, error 
            });
            throw error;
        }
    }
    
    // 更新告警通知状态
    async updateAlertNotification(recordId, sent = true, time = null) {
        try {
            await db.run(
                `UPDATE alert_records SET 
                 notification_sent = ?, 
                 notification_time = ? 
                 WHERE id = ?`,
                [sent ? 1 : 0, time || moment().toISOString(), recordId]
            );
            
            logger.debug(`更新告警通知状态成功: ${recordId} ${sent}`);
            
            return true;
        } catch (error) {
            logger.error(`更新告警通知状态失败: ${error.message}`, { recordId, sent, error });
            throw error;
        }
    }
    
    // 获取告警历史记录
    async getAlertHistory(options = {}) {
        try {
            const { 
                start, 
                end, 
                tokenId, 
                type, 
                priority,
                limit = 50, 
                offset = 0 
            } = options;
            
            // 构建查询条件
            const conditions = [];
            const params = [];
            
            if (start) {
                // 使用UTC时间格式，不转换为ISO
                const utcStartDate = moment.utc(start).format('YYYY-MM-DD HH:mm:ss');
                conditions.push('triggered_at >= ?');
                params.push(utcStartDate);
                logger.debug(`告警历史查询 - 开始时间: ${start}, UTC格式: ${utcStartDate}`);
            }
            
            if (end) {
                // 使用UTC时间格式，不转换为ISO
                const utcEndDate = moment.utc(end).format('YYYY-MM-DD HH:mm:ss');
                conditions.push('triggered_at <= ?');
                params.push(utcEndDate);
                logger.debug(`告警历史查询 - 结束时间: ${end}, UTC格式: ${utcEndDate}`);
            }
            
            if (tokenId) {
                conditions.push('token_id = ?');
                params.push(tokenId);
            }
            
            if (type) {
                conditions.push('alert_type = ?');
                params.push(type);
            }
            
            if (priority) {
                conditions.push('priority = ?');
                params.push(priority);
            }
            
            // 构建SQL查询
            let sql = 'SELECT * FROM alert_records';
            if (conditions.length > 0) {
                sql += ` WHERE ${conditions.join(' AND ')}`;
            }
            sql += ' ORDER BY triggered_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);
            
            // 记录完整SQL查询
            const debugSql = sql.replace(/\s+/g, ' ').trim();
            const paramsCopy = [...params];
            let debugQuery = debugSql;
            
            // 替换参数占位符，创建可读的查询字符串
            paramsCopy.forEach(param => {
                debugQuery = debugQuery.replace('?', typeof param === 'string' ? `'${param}'` : param);
            });
            
            logger.debug(`执行告警历史查询SQL: ${debugQuery}`);
            
            // 获取记录
            const records = await db.all(sql, params);
            
            // 获取总记录数
            let countSql = 'SELECT COUNT(*) as total FROM alert_records';
            if (conditions.length > 0) {
                countSql += ` WHERE ${conditions.join(' AND ')}`;
            }
            
            const countResult = await db.get(countSql, params.slice(0, -2));
            
            // 获取代币符号
            const recordsWithSymbol = [];
            for (const record of records) {
                const token = await tokenModel.getToken(record.token_id);
                recordsWithSymbol.push({
                    id: record.id,
                    alertId: record.alert_id,
                    tokenId: record.token_id,
                    tokenSymbol: token ? token.symbol : 'UNKNOWN',
                    alertType: record.alert_type,
                    condition: record.condition,
                    triggerValue: record.trigger_value,
                    currentValue: record.current_value,
                    triggeredAt: record.triggered_at,
                    notificationSent: Boolean(record.notification_sent),
                    notificationTime: record.notification_time,
                    priority: record.priority,
                    description: record.description
                });
            }
            
            return {
                total: countResult.total,
                results: recordsWithSymbol
            };
        } catch (error) {
            logger.error(`获取告警历史记录失败: ${error.message}`, { options, error });
            throw error;
        }
    }
    
    // 获取告警统计数据
    async getAlertStatistics(period = 'today') {
        try {
            // 计算时间范围 - 确保使用UTC时间
            let startDate;
            switch (period) {
                case 'today':
                    startDate = moment.utc().startOf('day').format('YYYY-MM-DD HH:mm:ss');
                    break;
                case 'yesterday':
                    startDate = moment.utc().subtract(1, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss');
                    break;
                case '7d':
                    startDate = moment.utc().subtract(7, 'days').format('YYYY-MM-DD HH:mm:ss');
                    break;
                case '30d':
                    startDate = moment.utc().subtract(30, 'days').format('YYYY-MM-DD HH:mm:ss');
                    break;
                default:
                    startDate = moment.utc().startOf('day').format('YYYY-MM-DD HH:mm:ss');
            }
            
            // 获取总告警数
            const totalResult = await db.get(
                'SELECT COUNT(*) as total FROM alert_records WHERE triggered_at >= ?',
                [startDate]
            );
            
            // 按类型分组
            const typeResult = await db.all(
                `SELECT alert_type, COUNT(*) as count 
                 FROM alert_records 
                 WHERE triggered_at >= ? 
                 GROUP BY alert_type`,
                [startDate]
            );
            
            // 按代币分组
            const tokenResult = await db.all(
                `SELECT token_id, COUNT(*) as count 
                 FROM alert_records 
                 WHERE triggered_at >= ? 
                 GROUP BY token_id 
                 ORDER BY count DESC 
                 LIMIT 10`,
                [startDate]
            );
            
            // 按优先级分组
            const priorityResult = await db.all(
                `SELECT priority, COUNT(*) as count 
                 FROM alert_records 
                 WHERE triggered_at >= ? 
                 GROUP BY priority`,
                [startDate]
            );
            
            // 处理按类型分组的结果
            const byType = {};
            for (const row of typeResult) {
                byType[row.alert_type] = row.count;
            }
            
            // 处理按代币分组的结果
            const byToken = {};
            let otherTokensCount = 0;
            
            for (const row of tokenResult) {
                if (Object.keys(byToken).length < 5) {
                    const token = await tokenModel.getToken(row.token_id);
                    byToken[token ? token.symbol : row.token_id] = row.count;
                } else {
                    otherTokensCount += row.count;
                }
            }
            
            if (otherTokensCount > 0) {
                byToken['others'] = otherTokensCount;
            }
            
            // 处理按优先级分组的结果
            const byPriority = {};
            for (const row of priorityResult) {
                byPriority[row.priority] = row.count;
            }
            
            return {
                total: totalResult.total,
                byType,
                byToken,
                byPriority
            };
        } catch (error) {
            logger.error(`获取告警统计数据失败: ${error.message}`, { period, error });
            throw error;
        }
    }
    
    // 格式化告警数据
    formatAlert(alert) {
        if (!alert) return null;
        
        try {
            // 解析条件JSON
            const conditionData = JSON.parse(alert.condition_json);
            
            // 使用moment-timezone格式化时间戳
            const formatTime = (timestamp) => {
                if (!timestamp) return null;
                // 直接以UTC解析时间戳，不依赖于系统时区设置
                return moment.utc(timestamp).format('YYYY-MM-DD HH:mm:ss');
            };
            
            return {
                id: alert.id,
                tokenId: alert.token_id,
                type: conditionData.type,
                condition: conditionData.condition,
                value: conditionData.value,
                ...(conditionData.timeframe && { timeframe: conditionData.timeframe }),
                enabled: Boolean(alert.enabled),
                oneTime: Boolean(alert.one_time),
                cooldown: alert.cooldown,
                priority: alert.priority,
                description: alert.description,
                lastTriggered: formatTime(alert.last_triggered),
                createdAt: formatTime(alert.created_at),
                updatedAt: formatTime(alert.updated_at)
            };
        } catch (error) {
            logger.error(`格式化告警数据失败: ${error.message}`, { alert, error });
            return {
                id: alert.id,
                tokenId: alert.token_id,
                type: 'unknown',
                condition: 'unknown',
                value: 0,
                enabled: Boolean(alert.enabled),
                oneTime: Boolean(alert.one_time),
                cooldown: alert.cooldown,
                priority: alert.priority,
                description: alert.description,
                lastTriggered: alert.last_triggered ? moment.utc(alert.last_triggered).format('YYYY-MM-DD HH:mm:ss') : null,
                createdAt: alert.created_at ? moment.utc(alert.created_at).format('YYYY-MM-DD HH:mm:ss') : null,
                updatedAt: alert.updated_at ? moment.utc(alert.updated_at).format('YYYY-MM-DD HH:mm:ss') : null
            };
        }
    }
    
    // 获取告警-代币最后触发时间
    async getAlertTokenLastTriggered(alertId, tokenId) {
        try {
            const record = await db.get(
                `SELECT * FROM alert_token_triggers 
                 WHERE alert_id = ? AND token_id = ?`,
                [alertId, tokenId]
            );
            
            return record;
        } catch (error) {
            logger.error(`获取告警-代币触发记录失败: ${error.message}`, { 
                alertId, tokenId, error 
            });
            return null;
        }
    }
    
    // 更新告警-代币最后触发时间
    async updateAlertTokenLastTriggered(alertId, tokenId, lastTriggered = null) {
        try {
            const timestamp = lastTriggered || moment.utc().format('YYYY-MM-DD HH:mm:ss');
            
            // 使用INSERT OR REPLACE简化操作（SQLite特性）
            await db.run(
                `INSERT OR REPLACE INTO alert_token_triggers 
                 (alert_id, token_id, last_triggered, updated_at) 
                 VALUES (?, ?, ?, datetime('now', 'utc'))`,
                [alertId, tokenId, timestamp]
            );
            
            logger.debug(`更新告警-代币最后触发时间成功: ${alertId}-${tokenId}, 时间: ${timestamp}`);
            return true;
        } catch (error) {
            logger.error(`更新告警-代币最后触发时间失败: ${error.message}`, { 
                alertId, tokenId, error 
            });
            return false;
        }
    }
    
    // 清除告警-代币最后触发时间
    async clearAlertTokenLastTriggered(alertId, tokenId) {
        try {
            await db.run(
                `DELETE FROM alert_token_triggers 
                 WHERE alert_id = ? AND token_id = ?`,
                [alertId, tokenId]
            );
            
            logger.debug(`清除告警-代币最后触发时间成功: ${alertId}-${tokenId}`);
            return true;
        } catch (error) {
            logger.error(`清除告警-代币最后触发时间失败: ${error.message}`, { 
                alertId, tokenId, error 
            });
            return false;
        }
    }
}

// 创建单例实例
const alertModel = new AlertModel();

module.exports = alertModel;