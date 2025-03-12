const { Telegraf } = require('telegraf');
const logger = require('./logger');
const config = require('../config');
const moment = require('moment-timezone');
const axios = require('axios');

class TelegramNotifier {
    constructor() {
        try {
            this.botToken = config.telegramBotToken;
            this.chatId = config.telegramChatId;
            this.timezone = config.timezone;
            this.maxRetries = 3;
            this.retryDelay = 2000;
            
            // 直接初始化机器人以验证配置
            this.bot = new Telegraf(this.botToken);
            
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
        // 强制使用UTC+8时区（中国标准时间）
        return moment(timestamp)
            .tz('Asia/Shanghai')
            .format('YYYY-MM-DD HH:mm:ss [UTC+8]');
    }
    
    // 带重试的API请求
    async sendApiRequest(message, retryCount = 0) {
        try {
            // 使用axios直接发送请求，避免Telegraf可能的问题
            const apiUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await axios.post(apiUrl, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            }, {
                timeout: 10000 // 10秒超时
            });
            
            return response.data;
        } catch (error) {
            logger.error(`Telegram API请求失败 (尝试 ${retryCount + 1}/${this.maxRetries}): ${error.message}`);
            
            // 详细记录错误信息
            if (error.response) {
                // 服务器返回了错误响应
                logger.error(`Telegram API响应: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                // 请求已发送但没有收到响应
                logger.error(`Telegram请求超时或无响应: ${error.code || 'unknown'}`);
            } else {
                // 请求配置出错
                logger.error(`Telegram请求配置错误: ${error.message}`);
            }
            
            // 重试逻辑
            if (retryCount < this.maxRetries) {
                logger.info(`${retryCount + 1}/${this.maxRetries} - 等待 ${this.retryDelay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.sendApiRequest(message, retryCount + 1);
            }
            
            throw error;
        }
    }
    
    // 发送价格告警通知
    async sendPriceAlert(alertData) {
        if (!this.botToken || !this.chatId) {
            logger.error('Telegram配置不完整: 缺少token或chatId');
            return false;
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
                description,
                priceSource,
                priceTimestamp
            } = alertData;
            
            // 格式化条件文本
            let conditionText = '';
            if (alertType === 'price') {
                conditionText = condition === 'above' 
                    ? `价格上涨超过 $${triggerValue}` 
                    : `价格下跌低于 $${triggerValue}`;
            } else if (alertType === 'percentage') {
                // 确保triggerValue是对象
                const timeframeHours = (triggerValue.timeframe || 300) / 3600;
                const actualChange = triggerValue.actualChange || '未知';
                
                // 如果有历史价格信息，添加详细比较
                const historyPrice = triggerValue.historyPrice;
                const historyTime = triggerValue.historyTime;
                
                let compareDetail = '';
                if (historyPrice && historyTime) {
                    compareDetail = `\n参考价格: $${historyPrice} (${this.formatTime(historyTime)})`;
                }
                
                conditionText = condition === 'increase' 
                    ? `在${timeframeHours}小时内上涨超过 ${triggerValue.value}% (实际: ${actualChange}%)${compareDetail}` 
                    : `在${timeframeHours}小时内下跌超过 ${triggerValue.value}% (实际: ${actualChange}%)${compareDetail}`;
            }
            
            // 价格来源信息
            const priceInfo = `$${currentPrice}${priceTimestamp ? ` (${this.formatTime(priceTimestamp)})` : ''}`;
            const sourceInfo = priceSource ? `\n价格来源: ${priceSource}` : '';
            
            // 构建消息
            const message = `
🚨 <b>价格告警</b> 🚨
代币: <b>${tokenSymbol}</b> (${tokenId})
${tokenDescription ? `描述: ${tokenDescription}\n` : ''}
当前价格: <b>${priceInfo}</b>${sourceInfo}
告警类型: ${alertType === 'price' ? '固定价格' : '价格变化百分比'}
触发条件: ${conditionText}
触发时间: ${this.formatTime(time)}
${description ? `说明: ${description}` : ''}
            `.trim();
            
            logger.info(`准备发送价格告警通知: ${tokenSymbol}`);
            
            // 使用直接API请求发送消息
            const result = await this.sendApiRequest(message);
            
            logger.info(`已发送价格告警通知: ${tokenSymbol}`);
            return true;
        } catch (error) {
            logger.error(`发送价格告警通知失败 (所有重试尝试均失败): ${error.message}`, { error, alertData });
            
            // 尝试使用备用方法发送
            try {
                logger.info(`尝试使用备用方法发送告警...`);
                if (this.bot) {
                    const simpleMessage = `🚨 价格告警: ${alertData.tokenSymbol} ${alertData.alertType} ${alertData.condition} ${alertData.currentPrice}`;
                    await this.bot.telegram.sendMessage(this.chatId, simpleMessage);
                    logger.info(`备用方法发送成功`);
                    return true;
                }
            } catch (backupError) {
                logger.error(`备用方法也失败了: ${backupError.message}`);
            }
            
            return false;
        }
    }
    
    // 发送系统告警通知
    async sendSystemAlert(alertData) {
        // 类似的实现，添加重试机制...
        // 省略类似的代码
        logger.warn('系统告警通知功能尚未实现');
        return false;
    }
}

// 创建单例实例
const telegramNotifier = new TelegramNotifier();

module.exports = telegramNotifier;