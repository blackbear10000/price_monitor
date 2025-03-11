const { Telegraf } = require('telegraf');
const logger = require('./logger');
const config = require('../config');
const moment = require('moment-timezone');

class TelegramNotifier {
    constructor() {
        try {
            this.bot = new Telegraf(config.telegramBotToken);
            this.chatId = config.telegramChatId;
            this.timezone = config.timezone;
            
            // 初始化机器人
            this.bot.catch((err, ctx) => {
                logger.error(`Telegram机器人错误: ${err.message}`, { error: err });
            });
            
            logger.info('Telegram通知服务已初始化');
        } catch (error) {
            logger.error(`Telegram通知服务初始化失败: ${error.message}`, { error });
            this.bot = null;
        }
    }
    
    // 格式化时间
    formatTime(timestamp) {
        return moment(timestamp)
            .tz(this.timezone)
            .format('YYYY-MM-DD HH:mm:ss z');
    }
    
    // 发送价格告警通知
    async sendPriceAlert(alertData) {
        if (!this.bot) {
            throw new Error('Telegram机器人未初始化');
        }
        
        try {
            const { 
                tokenSymbol, 
                tokenId, 
                tokenDescription, 
                currentPrice, 
                alertType, 
                condition, 
                triggerValue, 
                time,
                description 
            } = alertData;
            
            // 格式化条件文本
            let conditionText = '';
            if (alertType === 'price') {
                conditionText = condition === 'above' 
                    ? `价格上涨超过 $${triggerValue}` 
                    : `价格下跌低于 $${triggerValue}`;
            } else if (alertType === 'percentage') {
                conditionText = condition === 'increase' 
                    ? `在${triggerValue.timeframe / 3600}小时内上涨超过 ${triggerValue.value}%` 
                    : `在${triggerValue.timeframe / 3600}小时内下跌超过 ${triggerValue.value}%`;
            }
            
            // 构建消息
            const message = `
🚨 价格告警 🚨
代币：${tokenSymbol} (${tokenId})
描述：${tokenDescription || '无描述'}
当前价格：$${currentPrice}
告警类型：${alertType === 'price' ? '固定价格' : '价格变化百分比'}
触发条件：${conditionText}
触发时间：${this.formatTime(time)}
${description ? `说明：${description}` : ''}
            `.trim();
            
            // 发送消息
            await this.bot.telegram.sendMessage(this.chatId, message);
            logger.info(`已发送价格告警通知: ${tokenSymbol}`);
            
            return true;
        } catch (error) {
            logger.error(`发送价格告警通知失败: ${error.message}`, { error, alertData });
            throw error;
        }
    }
    
    // 发送系统告警通知
    async sendSystemAlert(alertData) {
        if (!this.bot) {
            throw new Error('Telegram机器人未初始化');
        }
        
        try {
            const { 
                alertType, 
                details, 
                time, 
                impact, 
                suggestedAction 
            } = alertData;
            
            // 构建消息
            const message = `
⚠️ 系统告警 ⚠️
类型：${alertType}
详情：${details}
时间：${this.formatTime(time)}
影响：${impact || '未知'}
${suggestedAction ? `建议操作：${suggestedAction}` : ''}
            `.trim();
            
            // 发送消息
            await this.bot.telegram.sendMessage(this.chatId, message);
            logger.info(`已发送系统告警通知: ${alertType}`);
            
            return true;
        } catch (error) {
            logger.error(`发送系统告警通知失败: ${error.message}`, { error, alertData });
            throw error;
        }
    }
}

// 创建单例实例
const telegramNotifier = new TelegramNotifier();

module.exports = telegramNotifier;