const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// 导出一个返回Promise的函数
module.exports = function() {
    return new Promise((resolve, reject) => {
        const dbPath = process.env.DATABASE_PATH || './data/price_monitor.db';

        // 确保数据库目录存在
        const fs = require('fs');
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        const db = new sqlite3.Database(dbPath);

        // 创建表
        db.serialize(() => {
            // Tokens表
            db.run(`CREATE TABLE IF NOT EXISTS tokens (
                id TEXT PRIMARY KEY,
                symbol TEXT NOT NULL,
                description TEXT,
                added_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
                last_updated DATETIME,
                last_price REAL,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                priority INTEGER DEFAULT 999
            )`, (err) => {
                if (err) {
                    console.error('创建tokens表失败:', err.message);
                }
            });

            // 创建tokens表的索引
            db.run('CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol)');
            db.run('CREATE INDEX IF NOT EXISTS idx_tokens_active_priority ON tokens(is_active, priority)');

            // Price Records表
            db.run(`CREATE TABLE IF NOT EXISTS price_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_id TEXT NOT NULL,
                price REAL NOT NULL,
                timestamp DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
                source TEXT NOT NULL,
                raw_data TEXT,
                FOREIGN KEY (token_id) REFERENCES tokens(id)
            )`);

            // 创建price_records表的索引
            db.run('CREATE INDEX IF NOT EXISTS idx_price_records_token_time ON price_records(token_id, timestamp)');
            db.run('CREATE INDEX IF NOT EXISTS idx_price_records_time ON price_records(timestamp)');

            // Alert Records表
            db.run(`CREATE TABLE IF NOT EXISTS alert_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_id TEXT NOT NULL,
                token_id TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                condition TEXT NOT NULL,
                trigger_value REAL NOT NULL,
                current_value REAL NOT NULL,
                triggered_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
                notification_sent BOOLEAN NOT NULL DEFAULT 0,
                notification_time DATETIME,
                priority TEXT NOT NULL DEFAULT 'medium',
                description TEXT,
                FOREIGN KEY (token_id) REFERENCES tokens(id)
            )`);

            // 创建alert_records表的索引
            db.run('CREATE INDEX IF NOT EXISTS idx_alert_records_token ON alert_records(token_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_alert_records_time ON alert_records(triggered_at)');

            // System Logs表
            db.run(`CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
                context TEXT
            )`);

            // 创建system_logs表的索引
            db.run('CREATE INDEX IF NOT EXISTS idx_system_logs_level_time ON system_logs(level, timestamp)');

            // Notification History表
            db.run(`CREATE TABLE IF NOT EXISTS notification_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_record_id INTEGER,
                channel TEXT NOT NULL,
                content TEXT NOT NULL,
                sent_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
                status TEXT NOT NULL,
                error_message TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (alert_record_id) REFERENCES alert_records(id)
            )`);

            // 创建notification_history表的索引
            db.run('CREATE INDEX IF NOT EXISTS idx_notification_history_time ON notification_history(sent_at)', (err) => {
                // 所有操作完成后关闭数据库连接并解析Promise
                db.close((closeErr) => {
                    if (err || closeErr) {
                        reject(err || closeErr);
                    } else {
                        console.log('初始数据库表创建成功');
                        resolve();
                    }
                });
            });
        });
    });
};