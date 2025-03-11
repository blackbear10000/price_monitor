const httpClient = require('../utils/http');
const logger = require('../utils/logger');
const tokenModel = require('../models/token');
const priceModel = require('../models/price');
const config = require('../config');

class PriceService {
    constructor() {
        this.apiEndpoint = config.apiEndpoint;
        this.requestTimeout = config.requestTimeout;
        this.maxRetryCount = config.maxRetryCount;
        this.maxConcurrentRequests = config.maxConcurrentRequests;
    }
    
    // 获取单个代币价格
    async getTokenPrice(tokenId) {
        try {
            // 检查代币是否存在
            const token = await tokenModel.getToken(tokenId);
            if (!token) {
                throw new Error(`代币ID '${tokenId}' 不存在`);
            }
            
            logger.debug(`正在获取代币价格: ${token.symbol} (${tokenId})`);
            
            // 构建请求数据
            const requestData = {
                data: {
                    coin: tokenId,
                    quote: 'USD'
                }
            };
            
            // 发送请求
            logger.info(`发送请求: ${this.apiEndpoint}`);
            const response = await httpClient.post(this.apiEndpoint, requestData, {
                timeout: this.requestTimeout,
                maxRetries: this.maxRetryCount
            });
            
            // 检查响应
            if (!response || !response.data || !response.result) {
                throw new Error(`无效的API响应: ${JSON.stringify(response)}`);
            }
            
            const price = response.result;
            
            logger.info(`获取代币价格成功: ${token.symbol} = $${price}`);
            
            // 记录价格
            await priceModel.addPriceRecord(tokenId, price, 'API', response);
            
            return {
                id: tokenId,
                symbol: token.symbol,
                price,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`获取代币价格失败: ${error.message}`, { tokenId, error });
            throw error;
        }
    }
    
    // 批量获取代币价格
    async batchGetPrices(options = {}) {
        try {
            const { tokenIds, concurrentLimit } = options;
            
            // 获取要更新的代币列表
            let tokens;
            if (tokenIds && Array.isArray(tokenIds) && tokenIds.length > 0) {
                // 使用指定的代币ID列表
                tokens = [];
                for (const id of tokenIds) {
                    const token = await tokenModel.getToken(id);
                    if (token && token.isActive) {
                        tokens.push(token);
                    }
                }
            } else {
                // 获取所有活跃代币
                tokens = await tokenModel.getAllTokens({ active: true });
            }
            
            if (tokens.length === 0) {
                logger.warn('没有找到活跃的代币');
                return [];
            }
            
            logger.info(`开始批量获取价格，共${tokens.length}个代币`);
            
            // 设置并发限制
            const limit = concurrentLimit || this.maxConcurrentRequests;
            
            // 分批处理请求
            const results = [];
            const errors = [];

          //   for (const token of tokens) {
          //     try {
          //         logger.debug(`正在处理代币 ${token.symbol} (ID: ${token.id})`);
          //         const result = await this.getTokenPrice(token.id);
          //         results.push(result);
          //     } catch (error) {
          //         logger.error(`获取代币 ${token.symbol} 价格失败: ${error.message}`);
          //         errors.push({
          //             tokenId: token.id,
          //             symbol: token.symbol,
          //             error: error.message
          //         });
          //     }
          // }
            
            // 使用Promise.all和分批处理来控制并发      
            for (let i = 0; i < tokens.length; i += limit) {
                const batch = tokens.slice(i, i + limit);
                
                logger.debug(`处理批次 ${i / limit + 1}，包含${batch.length}个代币`);
                
                const batchPromises = batch.map(token => 
                    this.getTokenPrice(token.id)
                        .then(result => results.push(result))
                        .catch(error => {
                            logger.error(`获取代币 ${token.symbol} 价格失败: ${error.message}`);
                            errors.push({
                                tokenId: token.id,
                                symbol: token.symbol,
                                error: error.message
                            });
                            return null;
                        })
                );
                
                // 等待当前批次完成
                await Promise.all(batchPromises);
            }
            
            logger.info(`批量获取价格完成: 成功=${results.length}, 失败=${errors.length}`);
            
            return {
                successful: results,
                failed: errors
            };
        } catch (error) {
            logger.error(`批量获取价格失败: ${error.message}`, { error });
            throw error;
        }
    }
    
    // 刷新单个代币价格
    async refreshTokenPrice(tokenId) {
        try {
            return await this.getTokenPrice(tokenId);
        } catch (error) {
            logger.error(`刷新代币价格失败: ${error.message}`, { tokenId, error });
            throw error;
        }
    }
    
    // 刷新所有代币价格
    async refreshAllPrices() {
        try {
            return await this.batchGetPrices();
        } catch (error) {
            logger.error(`刷新所有代币价格失败: ${error.message}`, { error });
            throw error;
        }
    }
}

// 创建单例实例
const priceService = new PriceService();

module.exports = priceService;