const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const moment = require('moment-timezone');
const config = require('../config');
const db = require('../utils/database');

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
        // 检查时间戳是否已经是UTC+8格式的字符串
        const momentObj = moment(timestamp);
        
        // 检查输入的timestamp是否已经是本地时间（UTC+8）
        const isLocalTime = process.env.TZ === 'Asia/Shanghai' && !timestamp.endsWith('Z') && !timestamp.includes('+');
        
        // 如果已经是本地时间，不需要再转换时区
        if (isLocalTime) {
            return momentObj.format('YYYY-MM-DD HH:mm:ss [UTC+8]');
        } else {
            // 否则进行时区转换
            return momentObj.tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss [UTC+8]');
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
    
    // 将告警保存到本地文件系统
    async saveAlertLocal(alertData) {
        try {
            // 格式化时间戳作为文件名的一部分
            const now = moment();
            const timeString = now.format('YYYY-MM-DD_HH-mm-ss');
            
            // 文件名格式: YYYY-MM-DD_HH-MM-SS_${tokenSymbol}_${alertType}_${condition}.json
            const fileName = `${timeString}_${alertData.tokenSymbol}_${alertData.alertType}_${alertData.condition}.json`;
            const filePath = path.join(this.alertsDir, fileName);
            
            // 格式化当前价格
            const formattedPrice = this.formatPrice(alertData.currentPrice);
            
            // 构建简化的保存内容
            const simplifiedData = {
                ...alertData,
                savedAt: db.formatTimestamp()
            };
            
            // 将数据写入文件
            await fs.promises.writeFile(filePath, JSON.stringify(simplifiedData, null, 2));
            
            // 创建一个可读的文本版本
            const textFilePath = path.join(this.alertsDir, `${timeString}_${alertData.tokenSymbol}_${alertData.condition}.txt`);
            
            // 构建更简洁的消息格式
            const message = `🚨 价格提醒：${alertData.tokenSymbol}
            
当前价格：$${formattedPrice}
            
保存时间: ${this.formatTime(db.formatTimestamp())}`.trim();
            
            await fs.promises.writeFile(textFilePath, message);
            
            logger.info(`告警已保存到本地文件: ${fileName}`);
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
            
            // 如果有历史价格信息，添加详细比较
            const historyPrice = triggerValue.historyPrice;
            const historyTime = triggerValue.historyTime;
            
            let compareDetail = '';
            if (historyPrice && historyTime) {
                const formattedHistoryPrice = this.formatPrice(historyPrice);
                compareDetail = `\n参考价格: $${formattedHistoryPrice} (${this.formatTime(historyTime)})`;
            }
            
            return condition === 'increase' 
                ? `在${timeframeHours}小时内上涨超过 ${triggerValue.value}% (实际: ${actualChange}%)${compareDetail}` 
                : `在${timeframeHours}小时内下跌超过 ${triggerValue.value}% (实际: ${actualChange}%)${compareDetail}`;
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