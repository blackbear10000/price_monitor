const db = require('../utils/database');
const logger = require('../utils/logger');
const tokenModel = require('./token');
const moment = require('moment-timezone');

class PriceModel {
    // 添加时间格式化方法
    formatTime(timestamp) {
        if (!timestamp) return null;
        // 直接以UTC解析时间戳，不依赖于系统时区设置
        return moment.utc(timestamp).format('YYYY-MM-DD HH:mm:ss');
    }
    
    // 添加价格记录
    async addPriceRecord(tokenId, price, source, rawData = null) {
        try {
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            // 插入价格记录
            await db.run(
                `INSERT INTO price_records (token_id, price, source, raw_data) 
                 VALUES (?, ?, ?, ?)`,
                [tokenId, price, source, rawData ? JSON.stringify(rawData) : null]
            );
            
            // 更新代币最新价格
            await tokenModel.updateTokenPrice(tokenId, price);
            
            logger.debug(`添加价格记录成功: ${tokenId} = $${price}`);
            
            return {
                tokenId,
                price,
                timestamp: db.formatTimestamp(),
                source
            };
        } catch (error) {
            logger.error(`添加价格记录失败: ${error.message}`, { tokenId, price, error });
            throw error;
        }
    }
    
    // 获取最新价格
    async getLatestPrice(tokenId) {
        try {
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            // 如果代币有最新价格，直接返回
            if (token.lastPrice !== null && token.lastUpdated) {
                return {
                    id: token.id,
                    symbol: token.symbol,
                    price: token.lastPrice,
                    lastUpdated: token.lastUpdated // 已经通过TokenModel.formatToken格式化
                };
            }
            
            // 否则从价格记录中查询
            const record = await db.get(
                `SELECT * FROM price_records 
                 WHERE token_id = ? 
                 ORDER BY timestamp DESC 
                 LIMIT 1`,
                [tokenId]
            );
            
            if (!record) {
                return {
                    id: token.id,
                    symbol: token.symbol,
                    price: null,
                    lastUpdated: null
                };
            }
            
            return {
                id: token.id,
                symbol: token.symbol,
                price: record.price,
                lastUpdated: this.formatTime(record.timestamp)
            };
        } catch (error) {
            logger.error(`获取最新价格失败: ${error.message}`, { tokenId, error });
            throw error;
        }
    }
    
    // 获取所有代币的最新价格
    async getAllLatestPrices(options = {}) {
        try {
            const { symbols, ids } = options;
            
            // 获取所有活跃代币
            let tokens = await tokenModel.getAllTokens({ active: true });
            
            // 根据符号或ID筛选
            if (symbols && symbols.length > 0) {
                const symbolList = Array.isArray(symbols) ? symbols : symbols.split(',');
                tokens = tokens.filter(token => symbolList.includes(token.symbol));
            }
            
            if (ids && ids.length > 0) {
                const idList = Array.isArray(ids) ? ids : ids.split(',');
                tokens = tokens.filter(token => idList.includes(token.id));
            }
            
            // 构建结果对象
            const result = {};
            
            for (const token of tokens) {
                // 如果代币有最新价格，直接使用
                if (token.lastPrice !== null && token.lastUpdated) {
                    result[token.symbol] = {
                        id: token.id,
                        price: token.lastPrice,
                        lastUpdated: token.lastUpdated // 已经通过TokenModel.formatToken格式化
                    };
                    continue;
                }
                
                // 否则从价格记录中查询
                const record = await db.get(
                    `SELECT * FROM price_records 
                     WHERE token_id = ? 
                     ORDER BY timestamp DESC 
                     LIMIT 1`,
                    [token.id]
                );
                
                result[token.symbol] = {
                    id: token.id,
                    price: record ? record.price : null,
                    lastUpdated: record ? this.formatTime(record.timestamp) : null
                };
            }
            
            return result;
        } catch (error) {
            logger.error(`获取所有最新价格失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 获取价格历史
    async getPriceHistory(tokenId, options = {}) {
        try {
            const { 
                start, 
                end, 
                interval = 'hour', 
                limit = 100,
                format = 'raw'
            } = options;
            
            // 首先记录输入参数
            logger.debug(`调用getPriceHistory - tokenId: ${tokenId}, 参数: ${JSON.stringify({
                start, end, interval, limit, format
            })}`);
            
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            // 构建查询条件
            const conditions = ['token_id = ?'];
            const params = [tokenId];
            
            if (start) {
                // 使用SQLite兼容的时间格式，而不是带T和Z的ISO格式
                const formattedDate = moment(start).format('YYYY-MM-DD HH:mm:ss');
                
                // 尝试两种不同的时间比较方法，看哪一种有效
                // 1. 使用 datetime 函数
                // conditions.push('timestamp <= datetime(?, "utc")');
                // params.push(formattedDate);
                
                // 2. 直接比较字符串格式 (SQLite 的时间戳是文本格式)
                conditions.push('timestamp <= ?');
                params.push(formattedDate);
                
                logger.debug(`价格历史查询时间条件 - start时间: ${start}`);
                logger.debug(`转换为SQLite格式: ${formattedDate}`);
                logger.debug(`查询条件: timestamp <= '${formattedDate}'`);
                
                // 额外测试：记录数据库中的时间戳格式
                try {
                    const sampleTimestamp = await db.get(
                        `SELECT timestamp FROM price_records WHERE token_id = ? ORDER BY timestamp DESC LIMIT 1`,
                        [tokenId]
                    );
                    if (sampleTimestamp) {
                        logger.debug(`数据库中的时间戳样例: ${sampleTimestamp.timestamp}`);
                        logger.debug(`样例时间戳格式: ${typeof sampleTimestamp.timestamp}`);
                    }
                } catch (err) {
                    logger.error(`获取时间戳样例失败: ${err.message}`);
                }
            }
            
            if (end) {
                // 使用SQLite兼容的时间格式，而不是带T和Z的ISO格式
                const formattedDate = moment(end).format('YYYY-MM-DD HH:mm:ss');
                
                // 尝试直接比较字符串
                conditions.push('timestamp >= ?');
                params.push(formattedDate);
                
                logger.debug(`价格历史查询时间条件 - end时间: ${end}`);
                logger.debug(`转换为SQLite格式: ${formattedDate}`);
                logger.debug(`查询条件: timestamp >= '${formattedDate}'`);
            }
            
            let sql;
            
            // 根据间隔选择查询方式
            if (interval === 'raw' || format === 'raw') {
                // 原始数据，直接查询
                sql = `
                    SELECT * FROM price_records 
                    WHERE ${conditions.join(' AND ')} 
                    ORDER BY timestamp DESC 
                    LIMIT ?
                `;
                params.push(limit);
                
                // 记录完整SQL查询
                const debugSql = sql.replace(/\s+/g, ' ').trim();
                const paramsCopy = [...params];
                let debugQuery = debugSql;
                
                // 替换参数占位符，创建可读的查询字符串
                paramsCopy.forEach(param => {
                    debugQuery = debugQuery.replace('?', typeof param === 'string' ? `'${param}'` : param);
                });
                
                logger.debug(`执行SQL查询: ${debugQuery}`);
                
                const records = await db.all(sql, params);
                
                if (records.length === 0) {
                    logger.debug(`没有找到符合条件的价格记录，尝试获取最近的记录而不考虑时间筛选`);
                    
                    // 如果没有找到记录，尝试获取任何记录（不使用时间筛选）
                    const fallbackSql = `
                        SELECT * FROM price_records 
                        WHERE token_id = ? 
                        ORDER BY timestamp DESC 
                        LIMIT ?
                    `;
                    
                    logger.debug(`执行备用SQL查询: ${fallbackSql.replace(/\s+/g, ' ').trim().replace('?', `'${tokenId}'`).replace('?', limit)}`);
                    
                    const fallbackRecords = await db.all(fallbackSql, [tokenId, limit]);
                    
                    if (fallbackRecords.length > 0) {
                        const oldestRecord = fallbackRecords[fallbackRecords.length-1];
                        const newestRecord = fallbackRecords[0];
                        
                        logger.debug(`找到${fallbackRecords.length}条不受时间筛选的记录:`);
                        logger.debug(`- 最早记录: 时间=${oldestRecord.timestamp}, 价格=${oldestRecord.price}`);
                        logger.debug(`- 最新记录: 时间=${newestRecord.timestamp}, 价格=${newestRecord.price}`);
                        
                        // 记录所有记录的时间和价格
                        fallbackRecords.forEach((record, index) => {
                            logger.debug(`记录[${index}]: 时间=${record.timestamp}, 价格=${record.price}`);
                        });
                    } else {
                        logger.warn(`没有找到任何价格记录，即使不考虑时间筛选`);
                    }
                    
                    return {
                        id: token.id,
                        symbol: token.symbol,
                        history: fallbackRecords.map(record => ({
                            timestamp: record.timestamp,
                            price: record.price
                        }))
                    };
                }
                
                const oldestRecord = records[records.length-1];
                const newestRecord = records[0];
                
                logger.debug(`找到${records.length}条价格记录:`);
                logger.debug(`- 最早记录: 时间=${oldestRecord.timestamp}, 价格=${oldestRecord.price}`);
                logger.debug(`- 最新记录: 时间=${newestRecord.timestamp}, 价格=${newestRecord.price}`);
                
                // 记录所有记录的时间和价格
                records.forEach((record, index) => {
                    logger.debug(`记录[${index}]: 时间=${record.timestamp}, 价格=${record.price}`);
                });
                
                return {
                    id: token.id,
                    symbol: token.symbol,
                    history: records.map(record => ({
                        timestamp: this.formatTime(record.timestamp),
                        price: record.price
                    }))
                };
            } else {
                // 聚合数据，使用时间分组
                let timeGroup;
                
                switch (interval) {
                    case 'minute':
                        timeGroup = "strftime('%Y-%m-%d %H:%M', timestamp)";
                        break;
                    case 'hour':
                        timeGroup = "strftime('%Y-%m-%d %H', timestamp)";
                        break;
                    case 'day':
                        timeGroup = "strftime('%Y-%m-%d', timestamp)";
                        break;
                    default:
                        timeGroup = "strftime('%Y-%m-%d %H', timestamp)";
                }
                
                if (format === 'candlestick') {
                    // 蜡烛图格式
                    sql = `
                        SELECT 
                            ${timeGroup} as time_group,
                            MIN(timestamp) as period_start,
                            MAX(timestamp) as period_end,
                            FIRST_VALUE(price) OVER (PARTITION BY ${timeGroup} ORDER BY timestamp) as open_price,
                            MAX(price) as high_price,
                            MIN(price) as low_price,
                            LAST_VALUE(price) OVER (PARTITION BY ${timeGroup} ORDER BY timestamp) as close_price
                        FROM price_records 
                        WHERE ${conditions.join(' AND ')} 
                        GROUP BY time_group
                        ORDER BY period_start DESC 
                        LIMIT ?
                    `;
                    params.push(limit);
                    
                    const records = await db.all(sql, params);
                    
                    return {
                        id: token.id,
                        symbol: token.symbol,
                        history: records.map(record => ({
                            timestamp: record.period_start,
                            open: record.open_price,
                            high: record.high_price,
                            low: record.low_price,
                            close: record.close_price
                        }))
                    };
                } else {
                    // 默认格式，使用平均价格
                    sql = `
                        SELECT 
                            ${timeGroup} as time_group,
                            MIN(timestamp) as period_start,
                            AVG(price) as avg_price
                        FROM price_records 
                        WHERE ${conditions.join(' AND ')} 
                        GROUP BY time_group
                        ORDER BY period_start DESC 
                        LIMIT ?
                    `;
                    params.push(limit);
                    
                    const records = await db.all(sql, params);
                    
                    return {
                        id: token.id,
                        symbol: token.symbol,
                        history: records.map(record => ({
                            timestamp: record.period_start,
                            price: record.avg_price
                        }))
                    };
                }
            }
        } catch (error) {
            logger.error(`获取价格历史失败: ${error.message}`, { tokenId, options, error });
            throw error;
        }
    }
    
    // 获取价格统计数据
    async getPriceStats(tokenId, period = '24h') {
        try {
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            // 获取当前价格
            const latestPrice = await this.getLatestPrice(tokenId);
            
            // 计算时间范围
            let timeAgo;
            switch (period) {
                case '1h':
                    timeAgo = moment().subtract(1, 'hour').toISOString();
                    break;
                case '24h':
                    timeAgo = moment().subtract(24, 'hours').toISOString();
                    break;
                case '7d':
                    timeAgo = moment().subtract(7, 'days').toISOString();
                    break;
                case '30d':
                    timeAgo = moment().subtract(30, 'days').toISOString();
                    break;
                default:
                    timeAgo = moment().subtract(24, 'hours').toISOString();
            }
            
            // 转换为SQLite兼容格式
            const formattedTimeAgo = moment(timeAgo).format('YYYY-MM-DD HH:mm:ss');
            logger.debug(`获取价格统计数据，时间范围: ${period}，查询时间: ${formattedTimeAgo}`);
            
            // 获取时间范围内的第一个价格
            const firstRecord = await db.get(
                `SELECT * FROM price_records 
                 WHERE token_id = ? AND timestamp >= ? 
                 ORDER BY timestamp ASC 
                 LIMIT 1`,
                [tokenId, formattedTimeAgo]
            );
            
            // 获取时间范围内的最高和最低价格
            const highLowPrices = await db.get(
                `SELECT MAX(price) as high, MIN(price) as low 
                 FROM price_records 
                 WHERE token_id = ? AND timestamp >= ?`,
                [tokenId, formattedTimeAgo]
            );
            
            // 计算价格变化百分比
            let changePercent = 0;
            if (firstRecord && latestPrice.price) {
                changePercent = ((latestPrice.price - firstRecord.price) / firstRecord.price) * 100;
            }
            
            return {
                id: token.id,
                symbol: token.symbol,
                currentPrice: latestPrice.price,
                changePercent: parseFloat(changePercent.toFixed(2)),
                high: highLowPrices ? highLowPrices.high : null,
                low: highLowPrices ? highLowPrices.low : null,
                lastUpdated: latestPrice.lastUpdated // latestPrice.lastUpdated已通过getLatestPrice格式化
            };
        } catch (error) {
            logger.error(`获取价格统计数据失败: ${error.message}`, { tokenId, period, error });
            throw error;
        }
    }
    
    // 清理历史数据
    async cleanupHistoricalData(days = null) {
        try {
            const retentionDays = days || parseInt(process.env.DATA_RETENTION_DAYS) || 90;
            
            // 使用SQLite兼容的日期格式，不带时间部分
            const cutoffDate = moment().subtract(retentionDays, 'days').format('YYYY-MM-DD');
            logger.debug(`清理历史数据，保留天数: ${retentionDays}，截止日期: ${cutoffDate}`);
            
            const result = await db.run(
                `DELETE FROM price_records 
                 WHERE timestamp < ?`,
                [cutoffDate]
            );
            
            logger.info(`清理历史价格数据成功: 删除了${result.changes}条记录`);
            
            return {
                deletedRecords: result.changes
            };
        } catch (error) {
            logger.error(`清理历史价格数据失败: ${error.message}`, { error });
            throw error;
        }
    }
}

// 创建单例实例
const priceModel = new PriceModel();

module.exports = priceModel;