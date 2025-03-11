const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');

// 加载环境变量
dotenv.config();

// 定义配置验证模式
const configSchema = Joi.object({
    // API配置
    API_SERVER_PORT: Joi.number().default(3000),
    API_KEY: Joi.string().required(),
    API_ENDPOINT: Joi.string().required(),
    
    // 价格更新配置
    PRICE_UPDATE_INTERVAL: Joi.number().default(300),
    REQUEST_TIMEOUT: Joi.number().default(5000),
    MAX_RETRY_COUNT: Joi.number().default(3),
    RETRY_DELAY_BASE: Joi.number().default(2000),
    
    // 时区配置
    TIMEZONE: Joi.string().default('UTC'),
    
    // 数据库配置
    DATABASE_PATH: Joi.string().default('./data/price_monitor.db'),
    
    // Telegram Bot配置
    TELEGRAM_BOT_TOKEN: Joi.string().required(),
    TELEGRAM_CHAT_ID: Joi.string().required(),
    
    // 日志配置
    LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    
    // 数据保留配置
    DATA_RETENTION_DAYS: Joi.number().default(90),
    
    // 性能配置
    MAX_CONCURRENT_REQUESTS: Joi.number().default(10),
    ALERT_NOTIFICATION_COOLDOWN: Joi.number().default(3600)
});

// 验证配置
const { error, value: envVars } = configSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: true
});

if (error) {
    throw new Error(`配置验证错误: ${error.message}`);
}

// 加载Token配置
const loadTokenConfig = () => {
    const tokenConfigPath = path.join(process.cwd(), 'config', 'tokens.json');
    
    // 如果配置文件不存在，创建默认配置
    if (!fs.existsSync(tokenConfigPath)) {
        const defaultConfig = {
            tokens: [
                {
                    symbol: "BTC",
                    id: "bitcoin",
                    description: "比特币",
                    priority: 1
                },
                {
                    symbol: "ETH",
                    id: "ethereum",
                    description: "以太坊",
                    priority: 2
                }
            ]
        };
        
        // 确保目录存在
        const configDir = path.dirname(tokenConfigPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(tokenConfigPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    
    // 读取配置文件
    try {
        const configData = fs.readFileSync(tokenConfigPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        throw new Error(`无法解析Token配置文件: ${error.message}`);
    }
};

// 加载告警配置
const loadAlertConfig = () => {
    const alertConfigPath = path.join(process.cwd(), 'config', 'alerts.json');
    
    // 如果配置文件不存在，创建默认配置
    if (!fs.existsSync(alertConfigPath)) {
        const defaultConfig = {
            globalAlerts: [
                {
                    id: "global-alert-1",
                    type: "price",
                    condition: "above",
                    value: 50000,
                    enabled: true,
                    oneTime: true,
                    cooldown: 3600,
                    priority: "high",
                    description: "BTC价格突破5万美元"
                }
            ],
            tokenAlerts: {
                "bitcoin": [
                    {
                        id: "btc-alert-1",
                        type: "price",
                        condition: "below",
                        value: 40000,
                        enabled: true,
                        oneTime: true,
                        cooldown: 3600,
                        priority: "high",
                        description: "BTC价格跌破4万美元"
                    }
                ]
            }
        };
        
        // 确保目录存在
        const configDir = path.dirname(alertConfigPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(alertConfigPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    
    // 读取配置文件
    try {
        const configData = fs.readFileSync(alertConfigPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        throw new Error(`无法解析告警配置文件: ${error.message}`);
    }
};

// 导出配置
module.exports = {
    port: envVars.API_SERVER_PORT,
    apiKey: envVars.API_KEY,
    apiEndpoint: envVars.API_ENDPOINT,
    priceUpdateInterval: envVars.PRICE_UPDATE_INTERVAL,
    requestTimeout: envVars.REQUEST_TIMEOUT,
    maxRetryCount: envVars.MAX_RETRY_COUNT,
    retryDelayBase: envVars.RETRY_DELAY_BASE,
    timezone: envVars.TIMEZONE,
    databasePath: envVars.DATABASE_PATH,
    telegramBotToken: envVars.TELEGRAM_BOT_TOKEN,
    telegramChatId: envVars.TELEGRAM_CHAT_ID,
    logLevel: envVars.LOG_LEVEL,
    dataRetentionDays: envVars.DATA_RETENTION_DAYS,
    maxConcurrentRequests: envVars.MAX_CONCURRENT_REQUESTS,
    alertNotificationCooldown: envVars.ALERT_NOTIFICATION_COOLDOWN,
    tokenConfig: loadTokenConfig(),
    alertConfig: loadAlertConfig()
};