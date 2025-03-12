const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const config = require('../config');
const logger = require('./logger');
const moment = require('moment-timezone');

class Database {
    constructor() {
        this.dbPath = config.databasePath || './data/price_monitor.db';
        
        // 确保数据库目录存在
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('数据库连接错误:', err.message);
            } else {
                console.log('已连接到SQLite数据库');
            }
        });
        
        // 启用外键约束
        this.db.run('PRAGMA foreign_keys = ON');

        // 添加格式化时间戳的方法
        this.formatTimestamp = formatTimestamp;

        // 为所有插入和更新操作添加时间戳处理
        const originalRun = this.db.run;
        const self = this; // 保存this引用
        
        this.db.run = function(sql, params, callback) {
            // 如果SQL包含datetime('now', 'utc')，替换为带参数的?，并添加格式化的时间戳
            if (typeof sql === 'string') {
                // 处理SQL中的datetime('now', 'utc')
                const nowPattern = /datetime\(['"]now['"], *['"]utc['"]\)/gi;
                
                // 检查是否包含默认值的时间戳设置，如 DEFAULT (datetime('now', 'utc'))
                const defaultPattern = /DEFAULT\s*\(\s*datetime\(['"]now['"],\s*['"]utc['"]\)\s*\)/gi;
                
                // 计算匹配次数以确定需要添加多少个参数
                let matches = 0;
                let modifiedSql = sql;
                
                // 替换常规的datetime('now', 'utc')
                if (nowPattern.test(sql)) {
                    matches = (sql.match(nowPattern) || []).length;
                    modifiedSql = sql.replace(nowPattern, '?');
                }
                
                // 替换DEFAULT (datetime('now', 'utc'))
                // 注意：这种情况SQLite会自动处理，实际不需要替换参数
                // 但我们将它记录下来以便调试
                if (defaultPattern.test(sql)) {
                    logger.debug(`SQL中包含默认时间戳: ${sql}`);
                }
                
                // 如果有匹配，添加对应数量的参数
                if (matches > 0) {
                    // 处理参数
                    if (!params) {
                        params = Array(matches).fill(self.formatTimestamp());
                    } else if (Array.isArray(params)) {
                        for (let i = 0; i < matches; i++) {
                            params.push(self.formatTimestamp());
                        }
                    } else {
                        // 如果params是回调函数
                        callback = params;
                        params = Array(matches).fill(self.formatTimestamp());
                    }
                    
                    sql = modifiedSql;
                    logger.debug(`修正SQL时间戳 (匹配 ${matches} 次): ${sql} 参数: ${JSON.stringify(params)}`);
                }
            }
            
            // 调用原始方法
            return originalRun.call(this, sql, params, callback);
        };
    }
    
    // 执行SQL查询并返回所有结果
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    
    // 执行SQL查询并返回第一行结果
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    
    // 执行SQL语句（插入、更新、删除等）
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }
    
    // 执行事务
    async transaction(callback) {
        try {
            await this.run('BEGIN TRANSACTION');
            const result = await callback(this);
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }
    
    // 关闭数据库连接
    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('数据库连接已关闭');
                    resolve();
                }
            });
        });
    }
}

// 在类定义之外，添加通用时间戳格式化函数
/**
 * 格式化时间戳为统一格式，不受系统时区影响
 * @param {string|Date} timestamp - 要格式化的时间戳，如果为null则使用当前时间
 * @returns {string} - 格式化后的时间戳字符串
 */
function formatTimestamp(timestamp = null) {
    // 创建UTC时间，不受系统时区影响
    if (!timestamp) {
        // 使用moment.utc()直接创建一个UTC时间，不通过本地时区转换
        return moment.utc().format('YYYY-MM-DD HH:mm:ss');
    }
    
    // 如果timestamp是ISO格式带Z的，moment()会自动识别为UTC
    // 如果是其他格式，我们强制将其解析为UTC
    return moment.utc(timestamp).format('YYYY-MM-DD HH:mm:ss');
}

// 创建单例实例
const database = new Database();

// 导出数据库实例和格式化函数
module.exports = database;
module.exports.formatTimestamp = formatTimestamp;