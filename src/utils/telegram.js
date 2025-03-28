const { Telegraf } = require('telegraf');
const logger = require('./logger');
const config = require('../config');
const moment = require('moment-timezone');
const axios = require('axios');

class TelegramNotifier {
    constructor() {
        try {
            this.botToken = config.telegramBotToken;
            this.chatIds = config.telegramChatId.split(',').map(id => id.trim());
            this.timezone = config.timezone;
            this.maxRetries = 3;
            this.retryDelay = 2000;
            
            // 直接初始化机器人以验证配置
            this.bot = new Telegraf(this.botToken);
            
            // 初始化机器人
            this.bot.catch((err, ctx) => {
                logger.error(`Telegram机器人错误: ${err.message}`, { error: err });
            });
            
            logger.info(`Telegram通知服务已初始化，配置的Chat IDs: ${this.chatIds.join(', ')}`);
        } catch (error) {
            logger.error(`Telegram通知服务初始化失败: ${error.message}`, { error });
            this.bot = null;
        }
    }
    
    // 格式化时间为本地显示格式（永远显示为Asia/Shanghai时区）
    formatTime(timestamp) {
        // 首先尝试解析输入的时间戳
        // 如果时间戳包含Z或+，表示它已经指定了时区（通常是UTC）
        const isUTC = timestamp && (timestamp.endsWith('Z') || timestamp.includes('+'));
        
        if (isUTC) {
            // 如果是UTC时间，将其转换为Asia/Shanghai时区显示
            return moment(timestamp).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss [UTC+8]');
        } else {
            // 如果没有指定时区，假设它已经是UTC时间格式
            return moment.utc(timestamp).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss [UTC+8]');
        }
    }
    
    // 格式化价格，根据价格大小动态调整精度
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
    
    // 带重试的API请求
    async sendApiRequest(message, chatId, retryCount = 0) {
        try {
            // 使用axios直接发送请求，避免Telegraf可能的问题
            const apiUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await axios.post(apiUrl, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            }, {
                timeout: 10000 // 10秒超时
            });
            
            return response.data;
        } catch (error) {
            logger.error(`Telegram API请求失败 (Chat ID: ${chatId}, 尝试 ${retryCount + 1}/${this.maxRetries}): ${error.message}`);
            
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
                return this.sendApiRequest(message, chatId, retryCount + 1);
            }
            
            throw error;
        }
    }
    
    // 向所有配置的Chat ID发送消息
    async sendToAllChats(message) {
        const results = [];
        const errors = [];

        for (const chatId of this.chatIds) {
            try {
                const result = await this.sendApiRequest(message, chatId);
                results.push({ chatId, success: true, result });
            } catch (error) {
                errors.push({ chatId, error: error.message });
                logger.error(`发送到Chat ID ${chatId}失败: ${error.message}`);
            }
        }

        // 如果所有发送都失败了，抛出错误
        if (errors.length === this.chatIds.length) {
            throw new Error(`向所有Chat ID发送消息均失败: ${JSON.stringify(errors)}`);
        }

        // 返回部分成功
        return {
            success: results.length > 0,
            results,
            errors
        };
    }
    
    // 发送价格告警通知
    async sendPriceAlert(alertData) {
        if (!this.botToken || this.chatIds.length === 0) {
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
                    const formattedHistoryPrice = this.formatPrice(historyPrice);
                    compareDetail = `\n参考价格: $${formattedHistoryPrice} (${this.formatTime(historyTime)})`;
                }
                
                conditionText = condition === 'increase' 
                    ? `在${timeframeHours}小时内上涨超过 ${triggerValue.value}% (实际: ${actualChange}%)` 
                    : `在${timeframeHours}小时内下跌超过 ${triggerValue.value}% (实际: ${actualChange}%)`;
            }
            
            // 格式化价格显示
            const formattedPrice = this.formatPrice(currentPrice);
            
            // 价格来源信息
            const priceInfo = `$${formattedPrice}`;
            const sourceInfo = priceSource ? `\n价格来源: ${priceSource}` : '';
            
            // 构建简化的消息格式
            const message = `🚨 <b>${tokenSymbol}</b> (${tokenId})
当前价格: <b>${priceInfo}</b>
触发条件: ${conditionText}`.trim();
            
            logger.info(`准备发送价格告警通知: ${tokenSymbol}`);
            
            // 使用新的sendToAllChats方法发送消息
            const result = await this.sendToAllChats(message);
            
            logger.info(`已发送价格告警通知: ${tokenSymbol}, 成功发送到 ${result.results.length} 个Chat ID`);
            return result.success;
        } catch (error) {
            logger.error(`发送价格告警通知失败 (所有重试尝试均失败): ${error.message}`, { error, alertData });
            
            // 尝试使用备用方法发送
            try {
                logger.info(`尝试使用备用方法发送告警...`);
                if (this.bot) {
                    // 使用与主要消息相同的简化格式
                    const formattedPrice = this.formatPrice(alertData.currentPrice);
                    const simpleMessage = `🚨 ${alertData.tokenSymbol} (${alertData.tokenId})\n当前价格: $${formattedPrice}\n触发时间: ${this.formatTime(alertData.time)}`;
                    
                    // 向所有Chat ID发送
                    let anySuccess = false;
                    for (const chatId of this.chatIds) {
                        try {
                            await this.bot.telegram.sendMessage(chatId, simpleMessage);
                            anySuccess = true;
                        } catch (chatError) {
                            logger.error(`备用方法发送到Chat ID ${chatId}失败: ${chatError.message}`);
                        }
                    }
                    
                    if (anySuccess) {
                        logger.info(`备用方法发送成功`);
                        return true;
                    }
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