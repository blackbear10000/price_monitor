const logger = require('../utils/logger');
const db = require('../utils/database');
const config = require('../config');
const moment = require('moment-timezone');

class CleanupService {
    constructor() {
        this.dataRetentionDays = config.dataRetentionDays;
    }
    
    // 清理价格历史数据
    async cleanupPriceHistory(days = null) {
        try {
            const retentionDays = days || this.dataRetentionDays;
            
            const cutoffDate = moment().subtract(retentionDays, 'days').format('YYYY-MM-DD');
            
            const result = await db.run(
                `DELETE FROM price_records 
                 WHERE timestamp < datetime(?, "utc")`,
                [cutoffDate]
            );
            
            logger.info(`清理价格历史数据成功: 删除了${result.changes}条记录`);
            
            return {
                deletedRecords: result.changes,
                dataType: 'price_history',
                cutoffDate
            };
        } catch (error) {
            logger.error(`清理价格历史数据失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 清理告警历史数据
    async cleanupAlertHistory(days = null) {
        try {
            const retentionDays = days || this.dataRetentionDays;
            
            const cutoffDate = moment().subtract(retentionDays, 'days').format('YYYY-MM-DD');
            
            const result = await db.run(
                `DELETE FROM alert_records 
                 WHERE triggered_at < datetime(?, "utc")`,
                [cutoffDate]
            );
            
            logger.info(`清理告警历史数据成功: 删除了${result.changes}条记录`);
            
            return {
                deletedRecords: result.changes,
                dataType: 'alert_history',
                cutoffDate
            };
        } catch (error) {
            logger.error(`清理告警历史数据失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 清理通知历史数据
    async cleanupNotificationHistory(days = null) {
        try {
            const retentionDays = days || this.dataRetentionDays;
            
            const cutoffDate = moment().subtract(retentionDays, 'days').format('YYYY-MM-DD');
            
            const result = await db.run(
                `DELETE FROM notification_history 
                 WHERE sent_at < datetime(?, "utc")`,
                [cutoffDate]
            );
            
            logger.info(`清理通知历史数据成功: 删除了${result.changes}条记录`);
            
            return {
                deletedRecords: result.changes,
                dataType: 'notification_history',
                cutoffDate
            };
        } catch (error) {
            logger.error(`清理通知历史数据失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 清理系统日志数据
    async cleanupSystemLogs(days = null) {
        try {
            const retentionDays = days || this.dataRetentionDays;
            
            const cutoffDate = moment().subtract(retentionDays, 'days').format('YYYY-MM-DD');
            
            const result = await db.run(
                `DELETE FROM system_logs 
                 WHERE timestamp < datetime(?, "utc") AND level != 'error'`,
                [cutoffDate]
            );
            
            logger.info(`清理系统日志数据成功: 删除了${result.changes}条记录`);
            
            // 错误日志保留更长时间
            const errorLogRetentionDays = retentionDays * 2;
            const errorCutoffDate = moment().subtract(errorLogRetentionDays, 'days').format('YYYY-MM-DD');
            
            const errorResult = await db.run(
                `DELETE FROM system_logs 
                 WHERE timestamp < datetime(?, "utc") AND level = 'error'`,
                [errorCutoffDate]
            );
            
            logger.info(`清理错误日志数据成功: 删除了${errorResult.changes}条记录`);
            
            return {
                deletedRecords: result.changes + errorResult.changes,
                dataType: 'system_logs',
                cutoffDate,
                errorCutoffDate
            };
        } catch (error) {
            logger.error(`清理系统日志数据失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 运行所有清理任务
    async runAllCleanupTasks() {
        try {
            const results = {};
            
            // 清理价格历史数据
            results.priceHistory = await this.cleanupPriceHistory();
            
            // 清理告警历史数据
            results.alertHistory = await this.cleanupAlertHistory();
            
            // 清理通知历史数据
            results.notificationHistory = await this.cleanupNotificationHistory();
            
            // 清理系统日志数据
            results.systemLogs = await this.cleanupSystemLogs();
            
            // 计算总删除记录数
            const totalDeleted = Object.values(results).reduce(
                (sum, result) => sum + result.deletedRecords, 0
            );
            
            logger.info(`所有清理任务完成，共删除${totalDeleted}条记录`);
            
            return {
                totalDeleted,
                details: results
            };
        } catch (error) {
            logger.error(`运行清理任务失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 获取数据库大小信息
    async getDatabaseSize() {
        try {
            // 获取数据库文件大小
            const fs = require('fs');
            const dbPath = process.env.DATABASE_PATH || './data/price_monitor.db';
            
            const stats = fs.statSync(dbPath);
            const fileSizeInBytes = stats.size;
            const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
            
            // 获取各表记录数
            const tableStats = {};
            
            const tables = [
                'tokens',
                'price_records',
                'alert_records',
                'system_logs',
                'notification_history'
            ];
            
            for (const table of tables) {
                const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
                tableStats[table] = result.count;
            }
            
            return {
                sizeBytes: fileSizeInBytes,
                sizeMB: fileSizeInMB.toFixed(2),
                tables: tableStats
            };
        } catch (error) {
            logger.error(`获取数据库大小信息失败: ${error.message}`, { error });
            throw error;
        }
    }
}

// 创建单例实例
const cleanupService = new CleanupService();

module.exports = cleanupService;