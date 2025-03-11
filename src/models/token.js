const db = require('../utils/database');
const logger = require('../utils/logger');

class TokenModel {
    // 获取所有代币
    async getAllTokens(options = {}) {
        try {
            const { active, sort = 'priority', order = 'asc' } = options;
            
            let sql = 'SELECT * FROM tokens';
            const params = [];
            
            // 筛选活跃状态
            if (active !== undefined) {
                sql += ' WHERE is_active = ?';
                params.push(active ? 1 : 0);
            }
            
            // 排序
            const validSortFields = ['symbol', 'priority', 'last_updated'];
            const validOrders = ['asc', 'desc'];
            
            const sortField = validSortFields.includes(sort) ? sort : 'priority';
            const sortOrder = validOrders.includes(order.toLowerCase()) ? order.toLowerCase() : 'asc';
            
            sql += ` ORDER BY ${sortField} ${sortOrder}`;
            
            const tokens = await db.all(sql, params);
            
            // 转换为驼峰命名
            return tokens.map(token => this.formatToken(token));
        } catch (error) {
            logger.error(`获取所有代币失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 获取单个代币
    async getToken(id) {
        try {
            const token = await db.get('SELECT * FROM tokens WHERE id = ?', [id]);
            
            if (!token) {
                return null;
            }
            
            return this.formatToken(token);
        } catch (error) {
            logger.error(`获取代币失败: ${error.message}`, { id, error });
            throw error;
        }
    }
    
    // 添加代币
    async addToken(tokenData) {
        try {
            const { id, symbol, description, priority = 999, isActive = true } = tokenData;
            
            // 检查代币是否已存在
            const existingToken = await this.getToken(id);
            if (existingToken) {
                throw new Error(`代币ID '${id}' 已存在`);
            }
            
            const result = await db.run(
                `INSERT INTO tokens (id, symbol, description, priority, is_active) 
                 VALUES (?, ?, ?, ?, ?)`,
                [id, symbol, description, priority, isActive ? 1 : 0]
            );
            
            logger.info(`添加代币成功: ${symbol} (${id})`);
            
            return {
                id,
                symbol,
                description,
                priority,
                isActive,
                addedAt: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`添加代币失败: ${error.message}`, { tokenData, error });
            throw error;
        }
    }
    
    // 更新代币
    async updateToken(id, tokenData) {
        try {
            const { symbol, description, priority, isActive } = tokenData;
            
            // 检查代币是否存在
            const existingToken = await this.getToken(id);
            if (!existingToken) {
                throw new Error(`代币ID '${id}' 不存在`);
            }
            
            // 构建更新字段
            const updates = [];
            const params = [];
            
            if (symbol !== undefined) {
                updates.push('symbol = ?');
                params.push(symbol);
            }
            
            if (description !== undefined) {
                updates.push('description = ?');
                params.push(description);
            }
            
            if (priority !== undefined) {
                updates.push('priority = ?');
                params.push(priority);
            }
            
            if (isActive !== undefined) {
                updates.push('is_active = ?');
                params.push(isActive ? 1 : 0);
            }
            
            if (updates.length === 0) {
                return existingToken;
            }
            
            // 添加最后更新时间
            updates.push('last_updated = datetime("now", "utc")');
            
            // 添加ID参数
            params.push(id);
            
            await db.run(
                `UPDATE tokens SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
            
            logger.info(`更新代币成功: ${id}`);
            
            // 获取更新后的代币
            return await this.getToken(id);
        } catch (error) {
            logger.error(`更新代币失败: ${error.message}`, { id, tokenData, error });
            throw error;
        }
    }
    
    // 更新代币价格
    async updateTokenPrice(id, price) {
        try {
            await db.run(
                `UPDATE tokens SET last_price = ?, last_updated = datetime("now", "utc") WHERE id = ?`,
                [price, id]
            );
            
            logger.debug(`更新代币价格成功: ${id} = $${price}`);
            
            return true;
        } catch (error) {
            logger.error(`更新代币价格失败: ${error.message}`, { id, price, error });
            throw error;
        }
    }
    
    // 删除代币
    async deleteToken(id) {
        try {
            // 检查代币是否存在
            const existingToken = await this.getToken(id);
            if (!existingToken) {
                throw new Error(`代币ID '${id}' 不存在`);
            }
            
            await db.run('DELETE FROM tokens WHERE id = ?', [id]);
            
            logger.info(`删除代币成功: ${id}`);
            
            return true;
        } catch (error) {
            logger.error(`删除代币失败: ${error.message}`, { id, error });
            throw error;
        }
    }
    
    // 批量添加代币
    async batchAddTokens(tokens) {
        try {
            const results = {
                added: 0,
                skipped: 0,
                tokens: []
            };
            
            for (const token of tokens) {
                try {
                    // 检查代币是否已存在
                    const existingToken = await this.getToken(token.id);
                    
                    if (existingToken) {
                        results.skipped++;
                        continue;
                    }
                    
                    const addedToken = await this.addToken(token);
                    results.added++;
                    results.tokens.push(addedToken);
                } catch (error) {
                    logger.warn(`批量添加代币时跳过: ${error.message}`, { token });
                    results.skipped++;
                }
            }
            
            logger.info(`批量添加代币完成: 添加=${results.added}, 跳过=${results.skipped}`);
            
            return results;
        } catch (error) {
            logger.error(`批量添加代币失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 格式化代币数据（转换为驼峰命名）
    formatToken(token) {
        if (!token) return null;
        
        return {
            id: token.id,
            symbol: token.symbol,
            description: token.description,
            lastPrice: token.last_price,
            lastUpdated: token.last_updated,
            isActive: Boolean(token.is_active),
            priority: token.priority,
            addedAt: token.added_at
        };
    }
}

// 创建单例实例
const tokenModel = new TokenModel();

module.exports = tokenModel;