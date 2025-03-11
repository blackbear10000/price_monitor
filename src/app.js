const express = require('express');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 导入配置和工具
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./utils/database');

// 导入服务
const priceService = require('./services/priceService');
const alertService = require('./services/alertService');
const cleanupService = require('./services/cleanupService');

// 导入中间件
const apiKeyAuth = require('./api/middleware/auth');
const { defaultLimiter } = require('./api/middleware/rateLimiter');
const errorHandler = require('./api/middleware/errorHandler');

// 导入路由
const tokenRoutes = require('./api/routes/tokens');
const priceRoutes = require('./api/routes/prices');
const alertRoutes = require('./api/routes/alerts');
const systemRoutes = require('./api/routes/system');

// 创建Express应用
const app = express();

// 配置中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 添加基本请求日志
app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.originalUrl}`);
    next();
});

// 添加限流中间件
app.use(defaultLimiter);

// API路由
const apiRouter = express.Router();

// 添加API认证中间件
apiRouter.use(apiKeyAuth);

// 注册API路由
apiRouter.use('/tokens', tokenRoutes);
apiRouter.use('/prices', priceRoutes);
apiRouter.use('/alerts', alertRoutes);
apiRouter.use('/system', systemRoutes);

// 将API路由挂载到/api路径
app.use('/api', apiRouter);

// 添加全局错误处理中间件
app.use(errorHandler);

// 设置定时任务
// 价格更新任务
const priceUpdateInterval = config.priceUpdateInterval || 300; // 默认5分钟
const priceUpdateCron = `*/${Math.max(1, Math.floor(priceUpdateInterval / 60))} * * * *`;

cron.schedule(priceUpdateCron, async () => {
    try {
        logger.info('执行价格更新任务');
        await priceService.refreshAllPrices();
    } catch (error) {
        logger.error(`价格更新任务失败: ${error.message}`, { error });
    }
});

// 告警检查任务
cron.schedule('* * * * *', async () => {
    try {
        logger.info('执行告警检查任务');
        await alertService.checkAllAlerts();
    } catch (error) {
        logger.error(`告警检查任务失败: ${error.message}`, { error });
    }
});

// 数据清理任务（每天凌晨3点执行）
cron.schedule('0 3 * * *', async () => {
    try {
        logger.info('执行数据清理任务');
        await cleanupService.runAllCleanupTasks();
    } catch (error) {
        logger.error(`数据清理任务失败: ${error.message}`, { error });
    }
});

// 确保数据目录存在
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 确保配置目录存在
const configDir = path.join(process.cwd(), 'config');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

// 初始化数据库
const initDatabase = async () => {
    try {
        // 运行数据库迁移
        // 使用Promise.all等待所有迁移完成
        await new Promise((resolve, reject) => {
            // 创建一个新的数据库连接
            const sqlite3 = require('sqlite3').verbose();
            const path = require('path');
            const fs = require('fs');
            
            const dbPath = process.env.DATABASE_PATH || './data/price_monitor.db';
            
            // 确保数据库目录存在
            const dbDir = path.dirname(dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            
            const db = new sqlite3.Database(dbPath);
            
            // 启用外键约束
            db.run('PRAGMA foreign_keys = ON');
            
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
                )`);
                
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
                db.run('CREATE INDEX IF NOT EXISTS idx_notification_history_time ON notification_history(sent_at)');
                
                // Alerts表
                db.run(`CREATE TABLE IF NOT EXISTS alerts (
                    id TEXT PRIMARY KEY,
                    token_id TEXT,
                    type TEXT NOT NULL,
                    condition_json TEXT NOT NULL,
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
                db.run('CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled)', function(err) {
                    if (err) {
                        db.close();
                        reject(err);
                    } else {
                        db.close();
                        resolve();
                    }
                });
            });
        });
        
        logger.info('数据库初始化成功');
        
        // 导入配置的代币
        const tokenConfig = config.tokenConfig;
        if (tokenConfig && tokenConfig.tokens && tokenConfig.tokens.length > 0) {
            const tokenModel = require('./models/token');
            await tokenModel.batchAddTokens(tokenConfig.tokens);
            logger.info(`从配置导入代币成功: ${tokenConfig.tokens.length}个代币`);
        }
        
        // 导入配置的告警
        const alertConfig = config.alertConfig;
        if (alertConfig) {
            const alertModel = require('./models/alert');
            await alertModel.batchAddAlerts(alertConfig);
            logger.info('从配置导入告警成功');
        }
    } catch (error) {
        logger.error(`数据库初始化失败: ${error.message}`, { error });
        process.exit(1);
    }
};

// 启动应用
const startApp = async () => {
    try {
        // 初始化数据库
        await initDatabase();
        
        // 启动服务器
        const port = config.port || 3000;
        app.listen(port, () => {
            logger.info(`服务器已启动，监听端口 ${port}`);
        });
    } catch (error) {
        logger.error(`应用启动失败: ${error.message}`, { error });
        process.exit(1);
    }
};

// 处理进程退出
process.on('SIGINT', async () => {
    try {
        logger.info('正在关闭应用...');
        await db.close();
        logger.info('应用已安全关闭');
        process.exit(0);
    } catch (error) {
        logger.error(`应用关闭失败: ${error.message}`, { error });
        process.exit(1);
    }
});

// 启动应用
startApp();