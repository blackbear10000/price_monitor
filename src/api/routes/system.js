const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');

// 获取系统状态信息
router.get('/status', systemController.getSystemStatus);

// 获取当前系统配置
router.get('/configuration', systemController.getConfiguration);

// 获取系统日志
router.get('/logs', systemController.getLogs);

// 健康检查接口
router.get('/health', systemController.healthCheck);

// 触发数据清理
router.post('/maintenance/cleanup', systemController.triggerCleanup);

// 重置并重新导入配置文件
router.post('/reset-config', systemController.resetAndReimportConfig);

module.exports = router;