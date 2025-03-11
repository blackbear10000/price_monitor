const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 配置日志级别
const logLevel = process.env.LOG_LEVEL || 'info';

// 创建日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// 创建控制台输出格式
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
        info => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// 创建日志记录器
const logger = winston.createLogger({
    level: logLevel,
    format: logFormat,
    defaultMeta: { service: 'price-monitor' },
    transports: [
        // 文件日志 - 错误级别
        new winston.transports.File({ 
            filename: path.join(logDir, 'error.log'), 
            level: 'error' 
        }),
        // 文件日志 - 所有级别
        new winston.transports.File({ 
            filename: path.join(logDir, 'combined.log') 
        }),
        // 控制台输出
        new winston.transports.Console({
            format: consoleFormat
        })
    ],
});

// 数据库日志记录函数
logger.logToDB = async (level, message, context = {}) => {
    try {
        // 这里我们将在后面实现数据库日志记录
        // 当数据库模块完成后会添加此功能
    } catch (error) {
        logger.error(`无法记录日志到数据库: ${error.message}`, { error });
    }
};

module.exports = logger;