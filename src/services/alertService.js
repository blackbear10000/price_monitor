const logger = require('../utils/logger');
const tokenModel = require('../models/token');
const priceModel = require('../models/price');
const alertModel = require('../models/alert');
const telegramNotifier = require('../utils/telegram');
const config = require('../config');
const moment = require('moment-timezone');

class AlertService {
    constructor() {
        this.alertNotificationCooldown = config.alertNotificationCooldown;
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
        
        for (const alert of alerts) {
            try {
                // 检查冷却期
                if (alert.lastTriggered) {
                    const lastTriggeredTime = moment(alert.lastTriggered);
                    const cooldownEnds = lastTriggeredTime.add(alert.cooldown, 'seconds');
                    
                    if (moment().isBefore(cooldownEnds)) {
                        logger.debug(`跳过告警 ${alert.id}，仍在冷却期内`);
                        continue;
                    }
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
                    const timeAgo = moment().subtract(alert.timeframe, 'seconds').toISOString();
                    
                    const historyOptions = {
                        start: timeAgo,
                        limit: 1,
                        interval: 'raw'
                    };
                    
                    const priceHistory = await priceModel.getPriceHistory(token.id, historyOptions);
                    
                    if (priceHistory.history.length > 0) {
                        const oldPrice = priceHistory.history[0].price;
                        const percentChange = ((currentPrice - oldPrice) / oldPrice) * 100;
                        
                        // 更新触发值为实际百分比变化
                        triggerValue = {
                            value: alert.value,
                            timeframe: alert.timeframe,
                            actualChange: percentChange.toFixed(2)
                        };
                        
                        if (alert.condition === 'increase' && percentChange >= alert.value) {
                            isTriggered = true;
                        } else if (alert.condition === 'decrease' && percentChange <= -alert.value) {
                            isTriggered = true;
                        }
                    } else {
                        logger.warn(`无法检查百分比告警 ${alert.id}，没有足够的历史数据`);
                    }
                }
                
                // 如果触发了告警
                if (isTriggered) {
                    logger.info(`触发告警: ${token.symbol} ${alert.type} ${alert.condition} ${alert.value}`);
                    
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
                    
                    // 如果是一次性告警，禁用它
                    if (alert.oneTime) {
                        await alertModel.updateAlert(alert.id, { enabled: false });
                        logger.info(`已禁用一次性告警: ${alert.id}`);
                    } else {
                        // 更新最后触发时间
                        await alertModel.updateAlert(alert.id, { 
                            lastTriggered: moment().toISOString() 
                        });
                    }
                    
                    // 发送通知
                    try {
                        const notificationData = {
                            tokenSymbol: token.symbol,
                            tokenId: token.id,
                            tokenDescription: token.description,
                            currentPrice,
                            alertType: alert.type,
                            condition: alert.condition,
                            triggerValue,
                            time: moment().toISOString(),
                            description: alert.description
                        };
                        
                        await telegramNotifier.sendPriceAlert(notificationData);
                        
                        // 更新通知状态
                        await alertModel.updateAlertNotification(alertRecord.id, true);
                    } catch (notifyError) {
                        logger.error(`发送告警通知失败: ${notifyError.message}`, { 
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
                        triggeredAt: moment().toISOString()
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
}

// 创建单例实例
const alertService = new AlertService();

module.exports = alertService;