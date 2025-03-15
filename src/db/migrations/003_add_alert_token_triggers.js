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

// 创建 alert_token_triggers 表，用于存储每个告警+代币组合的最后触发时间
db.serialize(() => {
    // alert_token_triggers表
    db.run(`CREATE TABLE IF NOT EXISTS alert_token_triggers (
        alert_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        last_triggered DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
        updated_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
        PRIMARY KEY (alert_id, token_id),
        FOREIGN KEY (alert_id) REFERENCES alerts(id),
        FOREIGN KEY (token_id) REFERENCES tokens(id)
    )`);

    // 创建索引以加速查询
    db.run('CREATE INDEX IF NOT EXISTS idx_att_alert_id ON alert_token_triggers(alert_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_att_token_id ON alert_token_triggers(token_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_att_last_triggered ON alert_token_triggers(last_triggered)');
    
    console.log('已创建 alert_token_triggers 表');
});

// 关闭数据库连接
db.close(); 