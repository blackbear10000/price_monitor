const express = require('express');
const router = express.Router();
const priceController = require('../controllers/priceController');

// 获取所有代币最新价格
router.get('/', priceController.getAllPrices);

// 获取特定代币最新价格
router.get('/:id', priceController.getPrice);

// 获取特定代币的价格历史
router.get('/:id/history', priceController.getPriceHistory);

// 获取价格统计数据
router.get('/:id/stats', priceController.getPriceStats);

// 手动刷新特定代币价格
router.post('/refresh/:id', priceController.refreshPrice);

// 手动刷新所有代币价格
router.post('/refresh', priceController.refreshAllPrices);

module.exports = router;