const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');

// 获取所有告警配置
router.get('/', alertController.getAllAlerts);

// 获取全局告警配置
router.get('/global', alertController.getGlobalAlerts);

// 获取特定代币的告警配置
router.get('/token/:id', alertController.getTokenAlerts);

// 添加全局告警
router.post('/global', alertController.addGlobalAlert);

// 添加特定代币告警
router.post('/token/:id', alertController.addTokenAlert);

// 更新告警配置
router.put('/:alertId', alertController.updateAlert);

// 删除告警配置
router.delete('/:alertId', alertController.deleteAlert);

// 批量添加告警
router.post('/batch', alertController.batchAddAlerts);

// 获取告警历史记录
router.get('/history', alertController.getAlertHistory);

// 获取特定代币的告警历史
router.get('/history/:tokenId', alertController.getTokenAlertHistory);

// 获取告警统计数据
router.get('/statistics', alertController.getAlertStatistics);

module.exports = router;