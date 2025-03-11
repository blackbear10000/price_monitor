const db = require('../utils/database');
const logger = require('../utils/logger');
const tokenModel = require('./token');
const moment = require('moment-timezone');

class PriceModel {
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
                timestamp: new Date().toISOString(),
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
                    lastUpdated: token.lastUpdated
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
                lastUpdated: record.timestamp
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
                        lastUpdated: token.lastUpdated
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
                    lastUpdated: record ? record.timestamp : null
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
            
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            // 构建查询条件
            const conditions = ['token_id = ?'];
            const params = [tokenId];
            
            if (start) {
                conditions.push('timestamp >= datetime(?, "utc")');
                params.push(moment(start).toISOString());
            }
            
            if (end) {
                conditions.push('timestamp <= datetime(?, "utc")');
                params.push(moment(end).toISOString());
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
                
                const records = await db.all(sql, params);
                
                return {
                    id: token.id,
                    symbol: token.symbol,
                    history: records.map(record => ({
                        timestamp: record.timestamp,
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
            
            // 获取时间范围内的第一个价格
            const firstRecord = await db.get(
                `SELECT * FROM price_records 
                 WHERE token_id = ? AND timestamp >= datetime(?, "utc")
                 ORDER BY timestamp ASC 
                 LIMIT 1`,
                [tokenId, timeAgo]
            );
            
            // 获取时间范围内的最高和最低价格
            const highLowPrices = await db.get(
                `SELECT MAX(price) as high, MIN(price) as low 
                 FROM price_records 
                 WHERE token_id = ? AND timestamp >= datetime(?, "utc")`,
                [tokenId, timeAgo]
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
                lastUpdated: latestPrice.lastUpdated
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
            
            const cutoffDate = moment().subtract(retentionDays, 'days').format('YYYY-MM-DD');
            
            const result = await db.run(
                `DELETE FROM price_records 
                 WHERE timestamp < datetime(?, "utc")`,
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