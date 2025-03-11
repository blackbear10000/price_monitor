const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');

// 获取所有代币
router.get('/', tokenController.getAllTokens);

// 获取单个代币
router.get('/:id', tokenController.getToken);

// 添加新代币
router.post('/', tokenController.addToken);

// 更新代币
router.put('/:id', tokenController.updateToken);

// 删除代币
router.delete('/:id', tokenController.deleteToken);

// 批量添加代币
router.post('/batch', tokenController.batchAddTokens);

module.exports = router;