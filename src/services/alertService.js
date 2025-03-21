const logger = require('../utils/logger');
const tokenModel = require('../models/token');
const priceModel = require('../models/price');
const alertModel = require('../models/alert');
const telegramNotifier = require('../utils/telegram');
const localNotifier = require('../utils/localNotifier');
const config = require('../config');
const moment = require('moment-timezone');
const db = require('../utils/database');
const path = require('path');
const fs = require('fs');

class AlertService {
    constructor() {
        this.alertNotificationCooldown = config.alertNotificationCooldown;
    }
    
    // 格式化价格，与其他工具保持一致
    formatPrice(price) {
        if (!price && price !== 0) return '未知';
        
        // 将字符串转为数字
        const numPrice = Number(price);
        
        // 根据价格大小动态调整小数位数
        if (numPrice >= 1000) {
            // 大于1000的价格保留2位小数
            return numPrice.toFixed(2);
        } else if (numPrice >= 100) {
            // 100-1000之间保留3位小数
            return numPrice.toFixed(3);
        } else if (numPrice >= 1) {
            // 1-100之间保留4位小数
            return numPrice.toFixed(4);
        } else if (numPrice >= 0.01) {
            // 0.01-1之间保留5位小数
            return numPrice.toFixed(5);
        } else if (numPrice >= 0.0001) {
            // 小于0.01的保留6位小数
            return numPrice.toFixed(6);
        } else {
            // 非常小的值保留8位小数
            return numPrice.toFixed(8);
        }
    }
    
    // 处理时间戳，确保使用正确的时区
    formatTimestamp(timestamp = null) {
        if (!timestamp) {
            // 直接生成UTC时间戳，格式与数据库中使用的格式一致
            return moment.utc().format('YYYY-MM-DD HH:mm:ss');
        }
        
        // 直接解析为UTC时间戳，格式与数据库中使用的格式一致
        return moment.utc(timestamp).format('YYYY-MM-DD HH:mm:ss');
    }
    
    // 检查所有代币的告警条件
    async checkAllAlerts() {
        try {
            // 获取所有活跃代币
            const tokens = await tokenModel.getAllTokens({ active: true });
            
            if (tokens.length === 0) {
                logger.warn('没有找到活跃的代币，跳过告警检查');
                return [];
            }
            
            logger.info(`开始检查告警条件，共${tokens.length}个代币`);
            
            const triggeredAlerts = [];
            
            // 获取全局告警配置
            const globalAlerts = await alertModel.getGlobalAlerts({ enabled: true });
            
            // 逐个检查代币
            for (const token of tokens) {
                try {
                    // 获取代币特定告警配置
                    const tokenAlerts = await alertModel.getTokenAlerts(token.id, { enabled: true });
                    
                    // 获取代币最新价格
                    const latestPrice = await priceModel.getLatestPrice(token.id);
                    
                    if (!latestPrice || latestPrice.price === null) {
                        logger.warn(`跳过代币 ${token.symbol} 的告警检查，没有价格数据`);
                        continue;
                    }
                    
                    // 检查代币特定告警
                    const tokenTriggered = await this.checkAlertsForToken(
                        token, tokenAlerts, latestPrice.price
                    );
                    
                    // 检查全局告警
                    const globalTriggered = await this.checkAlertsForToken(
                        token, globalAlerts, latestPrice.price
                    );
                    
                    // 合并触发的告警
                    triggeredAlerts.push(...tokenTriggered, ...globalTriggered);
                } catch (error) {
                    logger.error(`检查代币 ${token.symbol} 的告警条件失败: ${error.message}`, { 
                        tokenId: token.id, error 
                    });
                }
            }
            
            logger.info(`告警检查完成，触发了${triggeredAlerts.length}个告警`);
            
            return triggeredAlerts;
        } catch (error) {
            logger.error(`检查所有告警条件失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 检查单个代币的告警条件
    async checkAlertsForToken(token, alerts, currentPrice) {
        const triggeredAlerts = [];
        
        // 添加防重复告警机制
        const alertCache = new Map();
        
        for (const alert of alerts) {
            try {
                // 检查代币特定的冷却期（新的逻辑）
                const alertTokenRecord = await alertModel.getAlertTokenLastTriggered(alert.id, token.id);
                
                if (alertTokenRecord && alertTokenRecord.last_triggered) {
                    const lastTriggeredTime = moment.utc(alertTokenRecord.last_triggered);
                    const cooldownSeconds = alert.cooldown || 86400; // 默认1天
                    const cooldownEnds = lastTriggeredTime.clone().add(cooldownSeconds, 'seconds');
                    
                    if (moment.utc().isBefore(cooldownEnds)) {
                        const remainingCooldown = cooldownEnds.diff(moment.utc(), 'minutes');
                        logger.info(`跳过告警 ${alert.id} 对代币 ${token.symbol}，仍在冷却期内，冷却时间=${cooldownSeconds}秒，剩余约${remainingCooldown}分钟`);
                        continue;
                    }
                    
                    logger.debug(`告警 ${alert.id} 对代币 ${token.symbol} 的冷却期已结束，上次触发时间: ${alertTokenRecord.last_triggered}`);
                } else {
                    logger.debug(`告警 ${alert.id} 对代币 ${token.symbol} 之前从未触发过`);
                }
                
                // 创建缓存键，用于防止同一轮检查中多次触发相同条件
                const cacheKey = `${token.id}-${alert.type}-${alert.condition}-${alert.value}`;
                
                // 如果在这一轮检查中已经触发过，跳过
                if (alertCache.has(cacheKey)) {
                    logger.debug(`跳过告警 ${alert.id}，相同条件已在此轮检查中触发过`);
                    continue;
                }
                
                let isTriggered = false;
                let triggerValue = alert.value;
                
                // 检查告警条件
                if (alert.type === 'price') {
                    // 固定价格告警
                    if (alert.condition === 'above' && currentPrice >= alert.value) {
                        isTriggered = true;
                    } else if (alert.condition === 'below' && currentPrice <= alert.value) {
                        isTriggered = true;
                    }
                } else if (alert.type === 'percentage') {
                    // 百分比变化告警
                    // 获取指定时间窗口前的价格
                    const timeAgo = moment.utc().subtract(alert.timeframe, 'seconds').toISOString();
                    
                    logger.debug(`========= 告警检查 [${alert.id}] =========`);
                    logger.debug(`告警条件: ${alert.condition} ${alert.value}%, 时间窗口: ${alert.timeframe}秒`);
                    logger.debug(`检查代币: ${token.symbol}, 当前价格: ${currentPrice}`);
                    logger.debug(`查询 ${alert.timeframe} 秒前的价格: ${timeAgo}`);
                    
                    // 使用新的getPriceAt方法获取历史价格
                    const historicalPrice = await priceModel.getPriceAt(token.id, timeAgo);
                    
                    logger.debug(`查询结果: ${historicalPrice ? '找到历史价格记录' : '没有找到历史价格记录'}`);
                    
                    if (historicalPrice) {
                        const oldPrice = historicalPrice.price;
                        const historyTimestamp = historicalPrice.timestamp;
                        const percentChange = ((currentPrice - oldPrice) / oldPrice) * 100;
                        
                        logger.debug(`比较价格: 当前=${currentPrice}, 历史=${oldPrice}`);
                        logger.debug(`历史价格时间: ${historyTimestamp}`);
                        logger.debug(`计算变化百分比: (${currentPrice} - ${oldPrice}) / ${oldPrice} * 100 = ${percentChange.toFixed(2)}%`);
                        
                        // 更新触发值为实际百分比变化
                        triggerValue = {
                            value: alert.value,
                            timeframe: alert.timeframe,
                            actualChange: percentChange.toFixed(2),
                            historyPrice: oldPrice,
                            historyTime: historyTimestamp
                        };
                        
                        if (alert.condition === 'increase' && percentChange >= alert.value) {
                            logger.debug(`告警触发条件满足: ${percentChange.toFixed(2)}% >= ${alert.value}% (increase)`);
                            isTriggered = true;
                        } else if (alert.condition === 'decrease' && percentChange <= -alert.value) {
                            logger.debug(`告警触发条件满足: ${percentChange.toFixed(2)}% <= -${alert.value}% (decrease)`);
                            isTriggered = true;
                        } else {
                            if (alert.condition === 'increase') {
                                logger.debug(`告警条件未满足: ${percentChange.toFixed(2)}% < ${alert.value}% (increase)`);
                            } else {
                                logger.debug(`告警条件未满足: ${percentChange.toFixed(2)}% > -${alert.value}% (decrease)`);
                            }
                        }
                    } else {
                        logger.warn(`无法检查百分比告警 ${alert.id}，没有足够的历史数据`);
                    }
                    
                    logger.debug(`======= 告警检查结束 [${alert.id}] =======`);
                }
                
                // 如果触发了告警
                if (isTriggered) {
                    // 立即将条件添加到缓存，防止同样的条件在同一轮中再次触发
                    alertCache.set(cacheKey, true);
                    
                    logger.info(`触发告警: ${token.symbol} ${alert.type} ${alert.condition} ${alert.value}`);
                    
                    // 检查是否已经有相同告警记录且未发送通知的记录
                    const recentTriggered = await this.checkRecentTriggeredAlert(
                        alert.id, token.id, alert.type, alert.condition, triggerValue
                    );
                    
                    if (recentTriggered) {
                        logger.info(`发现相同的未通知告警记录，将复用已有记录: ${recentTriggered.id}`);
                        
                        // 记录到触发的告警列表
                        triggeredAlerts.push({
                            alertId: alert.id,
                            tokenId: token.id,
                            tokenSymbol: token.symbol,
                            alertType: alert.type,
                            condition: alert.condition,
                            triggerValue,
                            currentPrice,
                            triggeredAt: this.formatTimestamp(),
                            recordId: recentTriggered.id // 使用现有记录ID
                        });
                        
                        continue; // 跳过创建新记录
                    }
                    
                    // 记录告警触发
                    const alertRecord = await alertModel.recordAlertTrigger(
                        alert.id,
                        token.id,
                        alert.type,
                        alert.condition,
                        triggerValue,
                        currentPrice,
                        alert.priority,
                        alert.description
                    );
                    
                    // 设置当前UTC时间作为最后触发时间
                    const now = moment.utc().format('YYYY-MM-DD HH:mm:ss');
                    logger.info(`告警 ${alert.id} 对代币 ${token.symbol} 已触发，设置冷却期 ${alert.cooldown || 86400} 秒`);
                    
                    // 更新代币特定的最后触发时间
                    await alertModel.updateAlertTokenLastTriggered(alert.id, token.id, now);
                    
                    // 如果是一次性告警，禁用它
                    if (alert.oneTime) {
                        await alertModel.updateAlert(alert.id, { 
                            enabled: false
                        });
                        logger.info(`已禁用一次性告警: ${alert.id}`);
                    }
                    
                    // 发送通知
                    try {
                        // 获取最新价格的详细信息
                        const latestPrice = await priceModel.getLatestPrice(token.id);
                        
                        const notificationData = {
                            tokenSymbol: token.symbol,
                            tokenId: token.id,
                            tokenDescription: token.description,
                            currentPrice,
                            priceSource: 'API数据源', // 您可以根据实际情况修改这个值
                            priceTimestamp: latestPrice.lastUpdated, // 价格的时间戳
                            alertType: alert.type,
                            condition: alert.condition,
                            triggerValue,
                            time: this.formatTimestamp(),
                            description: alert.description
                        };
                        
                        logger.info(`尝试发送告警通知: ${token.symbol}`);
                        
                        // 先尝试通过Telegram发送
                        let notificationSent = false;
                        
                        try {
                            notificationSent = await telegramNotifier.sendPriceAlert(notificationData);
                        } catch (telegramError) {
                            logger.error(`Telegram通知发送失败: ${telegramError.message}`);
                        }
                        
                        // 如果Telegram发送失败，保存到本地文件
                        if (!notificationSent) {
                            logger.info(`尝试保存告警到本地文件...`);
                            await localNotifier.saveAlertLocal(notificationData);
                        }
                        
                        // 仅当通知发送成功或已保存到本地文件时，才更新告警记录状态
                        if (notificationSent || await this.checkLocalNotificationExists(token.symbol, alert.type, alert.condition)) {
                            await alertModel.updateAlertNotification(alertRecord.id, true);
                            logger.info(`告警通知处理完成: ${alertRecord.id}`);
                        } else {
                            logger.warn(`告警通知处理失败，将在下次检查时重试: ${alertRecord.id}`);
                        }
                    } catch (notifyError) {
                        logger.error(`发送告警通知过程中发生错误: ${notifyError.message}`, { 
                            alertId: alert.id, tokenId: token.id, error: notifyError 
                        });
                    }
                    
                    triggeredAlerts.push({
                        alertId: alert.id,
                        tokenId: token.id,
                        tokenSymbol: token.symbol,
                        alertType: alert.type,
                        condition: alert.condition,
                        triggerValue,
                        currentPrice,
                        triggeredAt: this.formatTimestamp(),
                        recordId: alertRecord.id // 使用新创建的记录ID，而不是recentTriggered.id
                    });
                }
            } catch (error) {
                logger.error(`检查告警 ${alert.id} 失败: ${error.message}`, { 
                    alertId: alert.id, tokenId: token.id, error 
                });
            }
        }
        
        return triggeredAlerts;
    }
    
    // 检查最近已触发的告警记录，不限于未发送通知的记录
    async checkRecentTriggeredAlert(alertId, tokenId, alertType, condition, triggerValue) {
        try {
            // 查询最近1小时内，相同条件触发的告警记录（不再限制notification_sent状态）
            const recentRecord = await db.get(
                `SELECT * FROM alert_records 
                 WHERE alert_id = ? 
                 AND token_id = ? 
                 AND alert_type = ? 
                 AND condition = ? 
                 AND triggered_at > datetime('now', '-1 hour')
                 ORDER BY triggered_at DESC 
                 LIMIT 1`,
                [alertId, tokenId, alertType, condition]
            );
            
            // 直接返回找到的记录，不再进行相似性判断
            return recentRecord;
        } catch (error) {
            logger.error(`检查最近告警记录失败: ${error.message}`, { error });
            return null;
        }
    }
    
    // 检查单个代币的告警条件
    async checkAlertsForSingleToken(tokenId) {
        try {
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            if (!token.isActive) {
                logger.warn(`代币 ${token.symbol} 未激活，跳过告警检查`);
                return [];
            }
            
            // 获取代币最新价格
            const latestPrice = await priceModel.getLatestPrice(tokenId);
            
            if (!latestPrice || latestPrice.price === null) {
                logger.warn(`跳过代币 ${token.symbol} 的告警检查，没有价格数据`);
                return [];
            }
            
            // 获取全局告警配置
            const globalAlerts = await alertModel.getGlobalAlerts({ enabled: true });
            
            // 获取代币特定告警配置
            const tokenAlerts = await alertModel.getTokenAlerts(tokenId, { enabled: true });
            
            // 检查代币特定告警
            const tokenTriggered = await this.checkAlertsForToken(
                token, tokenAlerts, latestPrice.price
            );
            
            // 检查全局告警
            const globalTriggered = await this.checkAlertsForToken(
                token, globalAlerts, latestPrice.price
            );
            
            // 合并触发的告警
            const triggeredAlerts = [...tokenTriggered, ...globalTriggered];
            
            logger.info(`代币 ${token.symbol} 的告警检查完成，触发了${triggeredAlerts.length}个告警`);
            
            return triggeredAlerts;
        } catch (error) {
            logger.error(`检查代币告警条件失败: ${error.message}`, { tokenId, error });
            throw error;
        }
    }
    
    // 新增方法：检查本地通知文件是否存在
    async checkLocalNotificationExists(tokenSymbol, alertType, condition) {
        try {
            const alertsDir = path.join(process.cwd(), 'data', 'alerts');
            if (!fs.existsSync(alertsDir)) {
                return false;
            }
            
            // 读取最近1小时内创建的文件
            const files = fs.readdirSync(alertsDir)
                .filter(file => {
                    const match = file.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_.*\.json$/);
                    if (!match) return false;
                    
                    const fileTimestamp = match[1].replace(/_/g, ' ').replace(/-/g, ':');
                    const fileTime = moment(`${fileTimestamp}`);
                    return fileTime.isAfter(moment().subtract(1, 'hour')) && 
                           file.includes(tokenSymbol) && 
                           file.includes(alertType) && 
                           file.includes(condition);
                });
            
            return files.length > 0;
        } catch (error) {
            logger.error(`检查本地通知文件失败: ${error.message}`, { error });
            return false;
        }
    }
}

// 创建单例实例
const alertService = new AlertService();

module.exports = alertService;