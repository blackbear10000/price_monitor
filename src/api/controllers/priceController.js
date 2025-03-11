const priceModel = require('../../models/price');
const priceService = require('../../services/priceService');
const logger = require('../../utils/logger');

// 获取所有代币最新价格
exports.getAllPrices = async (req, res) => {
    try {
        const { symbols, ids } = req.query;
        
        const options = {
            symbols: symbols ? symbols.split(',') : undefined,
            ids: ids ? ids.split(',') : undefined
        };
        
        const prices = await priceModel.getAllLatestPrices(options);
        
        res.json({
            success: true,
            data: prices
        });
    } catch (error) {
        logger.error(`API - 获取所有价格失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '获取价格列表失败',
            message: error.message
        });
    }
};

// 获取特定代币最新价格
exports.getPrice = async (req, res) => {
    try {
        const { id } = req.params;
        
        const price = await priceModel.getLatestPrice(id);
        
        if (!price) {
            return res.status(404).json({
                success: false,
                error: '代币不存在',
                message: `代币ID '${id}' 不存在`
            });
        }
        
        res.json({
            success: true,
            data: price
        });
    } catch (error) {
        logger.error(`API - 获取价格失败: ${error.message}`, { id: req.params.id, error });
        res.status(500).json({
            success: false,
            error: '获取价格失败',
            message: error.message
        });
    }
};

// 获取特定代币的价格历史
exports.getPriceHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { start, end, interval, limit, format } = req.query;
        
        const options = {
            start,
            end,
            interval,
            limit: limit ? parseInt(limit) : undefined,
            format
        };
        
        const history = await priceModel.getPriceHistory(id, options);
        
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        logger.error(`API - 获取价格历史失败: ${error.message}`, { id: req.params.id, query: req.query, error });
        res.status(500).json({
            success: false,
            error: '获取价格历史失败',
            message: error.message
        });
    }
};

// 获取价格统计数据
exports.getPriceStats = async (req, res) => {
    try {
        const { id } = req.params;
        const { period } = req.query;
        
        const stats = await priceModel.getPriceStats(id, period);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error(`API - 获取价格统计数据失败: ${error.message}`, { id: req.params.id, period: req.query.period, error });
        res.status(500).json({
            success: false,
            error: '获取价格统计数据失败',
            message: error.message
        });
    }
};

// 手动刷新特定代币价格
exports.refreshPrice = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await priceService.refreshTokenPrice(id);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error(`API - 刷新价格失败: ${error.message}`, { id: req.params.id, error });
        res.status(500).json({
            success: false,
            error: '刷新价格失败',
            message: error.message
        });
    }
};

// 手动刷新所有代币价格
exports.refreshAllPrices = async (req, res) => {
    try {
        const result = await priceService.refreshAllPrices();
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error(`API - 刷新所有价格失败: ${error.message}`, { error });
        res.status(500).json({
            success: false,
            error: '刷新所有价格失败',
            message: error.message
        });
    }
};