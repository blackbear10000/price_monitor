const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const telegramNotifier = require('../utils/telegram');
const db = require('../utils/database');
const config = require('../config');
const moment = require('moment-timezone');

class NotifyService {
    constructor() {
        this.notificationQueue = [];
        this.isProcessing = false;
        this.maxRetryCount = config.maxRetryCount;
        this.alertsDir = path.join(process.cwd(), 'data', 'alerts');
        this.timezone = config.timezone;
        
        // 确保目录存在
        if (!fs.existsSync(this.alertsDir)) {
            fs.mkdirSync(this.alertsDir, { recursive: true });
        }
        
        logger.info('本地通知服务已初始化');
    }
    
    // 将通知添加到队列
    addToQueue(notification) {
        const id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const queueItem = {
            id,
            notification,
            retryCount: 0,
            status: 'pending',
            timestamp: db.formatTimestamp(),
            errors: []
        };
        
        this.notificationQueue.push(queueItem);
        logger.debug(`已添加通知到队列: ${id}`);
        
        this.processQueue();
        return id;
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
                        await this.recordNotification(notification.alertRecordId, 'telegram', JSON.stringify(notification.notification), 'failed', notification.lastError, notification.retryCount);
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
            await this.recordNotification(notification.alertRecordId, 'telegram', JSON.stringify(notification.notification), 'sent');
            
            return true;
        } catch (error) {
            logger.error(`发送通知失败: ${error.message}`, { notification, error });
            throw error;
        }
    }
    
    // 记录通知历史
    async recordNotification(alertRecordId, channel, content, status, errorMessage = null, retryCount = 0) {
        try {
            await db.run(
                `INSERT INTO notification_history (
                    alert_record_id, channel, content, status, error_message, retry_count
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [alertRecordId, channel, content, status, errorMessage, retryCount]
            );
            
            logger.debug(`已记录通知历史: ${alertRecordId} ${status}`);
            
            return {
                alertRecordId,
                channel,
                status,
                timestamp: db.formatTimestamp()
            };
        } catch (error) {
            logger.error(`记录通知历史失败: ${error.message}`, { error });
            return null;
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
    
    // 保存告警到本地文件
    async saveAlertLocal(alertData) {
        try {
            const { 
                tokenSymbol, 
                tokenId, 
                currentPrice, 
                alertType, 
                condition, 
                triggerValue, 
                time,
                description 
            } = alertData;
            
            // 生成文件名
            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const filename = `${timestamp}_${tokenSymbol}_${alertType}_${condition}.json`;
            const filepath = path.join(this.alertsDir, filename);
            
            // 保存告警数据
            fs.writeFileSync(filepath, JSON.stringify({
                ...alertData,
                savedAt: new Date().toISOString()
            }, null, 2));
            
            logger.info(`已保存告警到本地文件: ${filename}`);
            return true;
        } catch (error) {
            logger.error(`保存告警到本地文件失败: ${error.message}`, { error, alertData });
            return false;
        }
    }
    
    // 获取最近的本地告警
    async getRecentAlerts(limit = 10) {
        try {
            // 读取目录中的文件
            const files = fs.readdirSync(this.alertsDir)
                .filter(file => file.endsWith('.json'))
                .sort()
                .reverse()
                .slice(0, limit);
            
            const alerts = [];
            
            for (const file of files) {
                try {
                    const data = fs.readFileSync(path.join(this.alertsDir, file), 'utf8');
                    alerts.push(JSON.parse(data));
                } catch (err) {
                    logger.error(`读取告警文件失败: ${file}`, { error: err });
                }
            }
            
            return alerts;
        } catch (error) {
            logger.error(`获取最近告警失败: ${error.message}`, { error });
            return [];
        }
    }
    
    // 清理旧的告警文件
    async cleanupOldAlerts(days = 7) {
        try {
            const cutoffTime = moment().subtract(days, 'days');
            
            const files = fs.readdirSync(this.alertsDir)
                .filter(file => file.endsWith('.json'));
            
            let deleted = 0;
            
            for (const file of files) {
                try {
                    const filePath = path.join(this.alertsDir, file);
                    const stats = fs.statSync(filePath);
                    const fileTime = moment(stats.mtime);
                    
                    if (fileTime.isBefore(cutoffTime)) {
                        fs.unlinkSync(filePath);
                        deleted++;
                    }
                } catch (err) {
                    logger.error(`删除告警文件失败: ${file}`, { error: err });
                }
            }
            
            logger.info(`清理旧告警文件完成: 删除了${deleted}个文件`);
            return deleted;
        } catch (error) {
            logger.error(`清理旧告警文件失败: ${error.message}`, { error });
            return 0;
        }
    }
}

// 创建单例实例
const notifyService = new NotifyService();

module.exports = notifyService;