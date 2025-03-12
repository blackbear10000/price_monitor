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
        this.formatTimestamp = (timestamp = null) => {
            if (!timestamp) {
                // 使用UTC时间格式，避免系统时区影响
                return moment().utc().format('YYYY-MM-DD HH:mm:ss');
            }
            
            // 对于传入的时间戳，确保转换为UTC
            return moment(timestamp).utc().format('YYYY-MM-DD HH:mm:ss');
        };

        // 为所有插入和更新操作添加时间戳处理
        const originalRun = this.db.run;
        const self = this; // 保存this引用
        
        this.db.run = function(sql, params, callback) {
            // 如果SQL包含datetime('now', 'utc')，替换为带参数的?，并添加格式化的时间戳
            if (typeof sql === 'string') {
                const nowPattern = /datetime\(['"]now['"], *['"]utc['"]\)/gi;
                if (nowPattern.test(sql)) {
                    sql = sql.replace(nowPattern, '?');
                    
                    // 处理参数
                    if (!params) {
                        params = [self.formatTimestamp()];
                    } else if (Array.isArray(params)) {
                        params.push(self.formatTimestamp());
                    } else {
                        // 如果params是回调函数
                        callback = params;
                        params = [self.formatTimestamp()];
                    }
                    
                    logger.debug(`修正SQL时间戳: ${sql} 参数: ${JSON.stringify(params)}`);
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

// 创建单例实例
const database = new Database();

module.exports = database;