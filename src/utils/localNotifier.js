const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const moment = require('moment-timezone');
const config = require('../config');

class LocalNotifier {
    constructor() {
        this.alertsDir = path.join(process.cwd(), 'data', 'alerts');
        this.timezone = config.timezone;
        
        // 确保目录存在
        if (!fs.existsSync(this.alertsDir)) {
            fs.mkdirSync(this.alertsDir, { recursive: true });
        }
        
        logger.info('本地通知服务已初始化');
    }
    
    // 格式化时间
    formatTime(timestamp) {
        return moment(timestamp)
            .tz(this.timezone)
            .format('YYYY-MM-DD HH:mm:ss z');
    }
    
    // 保存告警到本地文件
    async saveAlertLocal(alertData) {
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
            
            // 生成文件名
            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const filename = `${timestamp}_${tokenSymbol}_${alertType}_${condition}.json`;
            const filepath = path.join(this.alertsDir, filename);
            
            // 保存告警数据
            fs.writeFileSync(filepath, JSON.stringify({
                ...alertData,
                savedAt: new Date().toISOString()
            }, null, 2));
            
            // 创建一个人类可读的文本文件
            const textContent = `
价格告警
=========
代币: ${tokenSymbol} (${tokenId})
${tokenDescription ? `描述: ${tokenDescription}\n` : ''}
当前价格: $${currentPrice}
告警类型: ${alertType === 'price' ? '固定价格' : '价格变化百分比'}
触发条件: ${this.formatConditionText(alertType, condition, triggerValue)}
触发时间: ${this.formatTime(time)}
${description ? `说明: ${description}` : ''}
保存时间: ${this.formatTime(new Date())}
            `.trim();
            
            const textFilepath = path.join(this.alertsDir, `${timestamp}_${tokenSymbol}_${alertType}_${condition}.txt`);
            fs.writeFileSync(textFilepath, textContent);
            
            logger.info(`已保存告警到本地文件: ${filename}`);
            return true;
        } catch (error) {
            logger.error(`保存告警到本地文件失败: ${error.message}`, { error, alertData });
            return false;
        }
    }
    
    // 格式化条件文本
    formatConditionText(alertType, condition, triggerValue) {
        if (alertType === 'price') {
            return condition === 'above' 
                ? `价格上涨超过 $${triggerValue}` 
                : `价格下跌低于 $${triggerValue}`;
        } else if (alertType === 'percentage') {
            // 确保triggerValue是对象
            const timeframeHours = (triggerValue.timeframe || 300) / 3600;
            const actualChange = triggerValue.actualChange || '未知';
            
            return condition === 'increase' 
                ? `在${timeframeHours}小时内上涨超过 ${triggerValue.value}% (实际: ${actualChange}%)` 
                : `在${timeframeHours}小时内下跌超过 ${triggerValue.value}% (实际: ${actualChange}%)`;
        }
        return '未知条件';
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
                .filter(file => file.endsWith('.json') || file.endsWith('.txt'));
            
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
const localNotifier = new LocalNotifier();

module.exports = localNotifier; 