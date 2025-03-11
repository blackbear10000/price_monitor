const axios = require('axios');
const logger = require('./logger');
const config = require('../config');

class HttpClient {
    constructor() {
        // 创建axios实例
        this.client = axios.create({
            timeout: config.requestTimeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // 请求拦截器
        this.client.interceptors.request.use(
            (config) => {
                logger.debug(`发送请求: ${config.method.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error(`请求错误: ${error.message}`, { error });
                return Promise.reject(error);
            }
        );
        
        // 响应拦截器
        this.client.interceptors.response.use(
            (response) => {
                logger.debug(`收到响应: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                if (error.response) {
                    logger.error(`响应错误: ${error.response.status} ${error.config.url}`, {
                        status: error.response.status,
                        data: error.response.data
                    });
                } else if (error.request) {
                    logger.error(`请求超时或无响应: ${error.config.url}`, {
                        message: error.message
                    });
                } else {
                    logger.error(`请求配置错误: ${error.message}`, { error });
                }
                return Promise.reject(error);
            }
        );
    }
    
    // 带重试的请求方法
    async requestWithRetry(method, url, data = null, options = {}) {
        const maxRetries = options.maxRetries || config.maxRetryCount;
        const retryDelayBase = options.retryDelayBase || config.retryDelayBase;
        
        let retries = 0;
        let lastError = null;
        
        while (retries <= maxRetries) {
            try {
                const requestConfig = {
                    method,
                    url,
                    ...(data && method.toLowerCase() === 'get' 
                        ? { params: data } 
                        : { data }),
                    ...options
                };
                
                const response = await this.client(requestConfig);
                return response.data;
            } catch (error) {
                lastError = error;
                
                // 如果是服务器错误或网络错误，则重试
                const shouldRetry = !error.response || 
                                    (error.response && error.response.status >= 500) ||
                                    error.code === 'ECONNABORTED';
                
                if (!shouldRetry || retries >= maxRetries) {
                    break;
                }
                
                // 计算重试延迟（指数退避）
                const delay = retryDelayBase * Math.pow(2, retries);
                logger.warn(`请求失败，将在${delay}ms后重试 (${retries + 1}/${maxRetries})`, {
                    url,
                    method,
                    error: error.message
                });
                
                // 等待延迟时间
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
            }
        }
        
        // 所有重试都失败
        logger.error(`请求失败，已达到最大重试次数: ${url}`, {
            method,
            retries,
            error: lastError.message
        });
        
        throw lastError;
    }
    
    // 便捷方法
    async get(url, params = {}, options = {}) {
        return this.requestWithRetry('get', url, params, options);
    }
    
    async post(url, data = {}, options = {}) {
        return this.requestWithRetry('post', url, data, options);
    }
    
    async put(url, data = {}, options = {}) {
        return this.requestWithRetry('put', url, data, options);
    }
    
    async delete(url, options = {}) {
        return this.requestWithRetry('delete', url, null, options);
    }
}

// 创建单例实例
const httpClient = new HttpClient();

module.exports = httpClient;