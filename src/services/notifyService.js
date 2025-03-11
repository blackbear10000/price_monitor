const logger = require('../utils/logger');
const telegramNotifier = require('../utils/telegram');
const db = require('../utils/database');
const config = require('../config');

class NotifyService {
    constructor() {
        this.notificationQueue = [];
        this.isProcessing = false;
        this.maxRetryCount = config.maxRetryCount;
    }
    
    // 添加通知到队列
    async addToQueue(notification) {
        try {
            this.notificationQueue.push(notification);
            logger.debug(`通知已添加到队列，当前队列长度: ${this.notificationQueue.length}`);
            
            // 如果队列处理器未运行，启动它
            if (!this.isProcessing) {
                this.processQueue();
            }
            
            return true;
        } catch (error) {
            logger.error(`添加通知到队列失败: ${error.message}`, { notification, error });
            throw error;
        }
    }
    
    // 处理通知队列
    async processQueue() {
        if (this.isProcessing || this.notificationQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            while (this.notificationQueue.length > 0) {
                const notification = this.notificationQueue.shift();
                
                try {
                    await this.sendNotification(notification);
                } catch (error) {
                    logger.error(`发送通知失败: ${error.message}`, { notification, error });
                    
                    // 如果未达到最大重试次数，重新加入队列
                    if (!notification.retryCount || notification.retryCount < this.maxRetryCount) {
                        notification.retryCount = (notification.retryCount || 0) + 1;
                        notification.lastError = error.message;
                        
                        // 添加到队列末尾
                        this.notificationQueue.push(notification);
                        logger.debug(`通知将重试 (${notification.retryCount}/${this.maxRetryCount})`);
                    } else {
                        logger.error(`通知达到最大重试次数，放弃发送`, { notification });
                        
                        // 记录失败的通知
                        await this.recordNotification(notification, 'failed', error.message);
                    }
                }
                
                // 添加小延迟，避免发送过快
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } finally {
            this.isProcessing = false;
        }
    }
    
    // 发送通知
    async sendNotification(notification) {
        try {
            const { type, data } = notification;
            
            if (type === 'price_alert') {
                await telegramNotifier.sendPriceAlert(data);
            } else if (type === 'system_alert') {
                await telegramNotifier.sendSystemAlert(data);
            } else {
                throw new Error(`未知的通知类型: ${type}`);
            }
            
            logger.info(`通知发送成功: ${type}`);
            
            // 记录成功的通知
            await this.recordNotification(notification, 'sent');
            
            return true;
        } catch (error) {
            logger.error(`发送通知失败: ${error.message}`, { notification, error });
            throw error;
        }
    }
    
    // 记录通知历史
    async recordNotification(notification, status, errorMessage = null) {
        try {
            const { type, data, alertRecordId } = notification;
            
            await db.run(
                `INSERT INTO notification_history (
                    alert_record_id, channel, content, status, error_message, retry_count
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    alertRecordId || null,
                    'telegram',
                    JSON.stringify(data),
                    status,
                    errorMessage,
                    notification.retryCount || 0
                ]
            );
            
            logger.debug(`记录通知历史成功: ${type} ${status}`);
            
            return true;
        } catch (error) {
            logger.error(`记录通知历史失败: ${error.message}`, { notification, status, error });
            return false;
        }
    }
    
    // 发送价格告警通知
    async sendPriceAlert(alertData, alertRecordId = null) {
        try {
            const notification = {
                type: 'price_alert',
                data: alertData,
                alertRecordId,
                timestamp: new Date().toISOString()
            };
            
            return await this.addToQueue(notification);
        } catch (error) {
            logger.error(`添加价格告警通知失败: ${error.message}`, { alertData, error });
            throw error;
        }
    }
    
    // 发送系统告警通知
    async sendSystemAlert(alertData) {
        try {
            const notification = {
                type: 'system_alert',
                data: alertData,
                timestamp: new Date().toISOString()
            };
            
            return await this.addToQueue(notification);
        } catch (error) {
            logger.error(`添加系统告警通知失败: ${error.message}`, { alertData, error });
            throw error;
        }
    }
}

// 创建单例实例
const notifyService = new NotifyService();

module.exports = notifyService;