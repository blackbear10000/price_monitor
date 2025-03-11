const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './data/price_monitor.db';

// 确保数据库目录存在
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// 创建 alerts 表
db.serialize(() => {
    // Alerts表
    db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        token_id TEXT,
        type TEXT NOT NULL,
        condition TEXT NOT NULL,
        value REAL NOT NULL,
        timeframe INTEGER,
        enabled BOOLEAN NOT NULL DEFAULT 1,
        one_time BOOLEAN NOT NULL DEFAULT 0,
        cooldown INTEGER DEFAULT 3600,
        priority TEXT NOT NULL DEFAULT 'medium',
        description TEXT,
        last_triggered DATETIME,
        created_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
        updated_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
        FOREIGN KEY (token_id) REFERENCES tokens(id)
    )`);

    // 创建alerts表的索引
    db.run('CREATE INDEX IF NOT EXISTS idx_alerts_token ON alerts(token_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type)');
    db.run('CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled)');
    
    console.log('已创建 alerts 表');
});

// 关闭数据库连接
db.close();