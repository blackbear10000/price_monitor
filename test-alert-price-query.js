// 测试告警历史价格查询
require('dotenv').config();
const moment = require('moment-timezone');
const db = require('./src/utils/database');
const priceModel = require('./src/models/price');
const logger = require('./src/utils/logger');

// 设置日志级别为 debug
process.env.LOG_LEVEL = 'debug';

// 测试函数
async function testAlertPriceQuery() {
    console.log('====== 告警历史价格查询测试 ======');
    
    // 获取测试用的代币ID
    const testTokenId = process.argv[2] || 'bitcoin'; // 默认使用bitcoin，或通过命令行参数提供
    
    try {
        // 首先查询当前最新价格
        console.log(`\n----- 查询代币 ${testTokenId} 的最新价格 -----`);
        const latestPrice = await priceModel.getLatestPrice(testTokenId);
        console.log('最新价格:', latestPrice);
        
        // 测试时间窗口列表（秒）
        const timeframes = [300, 3600, 86400]; // 5分钟, 1小时, 24小时
        
        for (const timeframe of timeframes) {
            console.log(`\n----- 测试 ${timeframe} 秒前的价格查询 -----`);
            
            // 1. 使用原始方法（仅start参数）
            console.log('\n方法1: 仅使用start参数');
            const timeAgo = moment.utc().subtract(timeframe, 'seconds').toISOString();
            console.log(`${timeframe}秒前的时间点: ${timeAgo}`);
            
            const options1 = {
                start: timeAgo,
                limit: 1,
                interval: 'raw'
            };
            
            console.log('查询参数:', JSON.stringify(options1));
            const result1 = await priceModel.getPriceHistory(testTokenId, options1);
            
            if (result1.history.length > 0) {
                console.log('查询结果:', {
                    价格: result1.history[0].price,
                    时间: result1.history[0].timestamp
                });
                
                // 计算与当前价格的差异
                if (latestPrice.price) {
                    const percentChange = ((latestPrice.price - result1.history[0].price) / result1.history[0].price) * 100;
                    console.log(`与当前价格的变化百分比: ${percentChange.toFixed(2)}%`);
                }
            } else {
                console.log('没有查询到历史价格');
            }
            
            // 2. 使用修改后的方法（带时间窗口的start和end参数）
            console.log('\n方法2: 使用时间窗口的start和end参数');
            const timeWindow = 10; // 10秒的时间窗口
            const historyTimeEnd = moment.utc().subtract(timeframe - timeWindow, 'seconds').toISOString();
            const historyTimeStart = moment.utc().subtract(timeframe + timeWindow, 'seconds').toISOString();
            
            console.log(`时间窗口: 从 ${timeframe + timeWindow}秒前 到 ${timeframe - timeWindow}秒前`);
            console.log(`开始时间: ${historyTimeStart}`);
            console.log(`结束时间: ${historyTimeEnd}`);
            
            const options2 = {
                start: historyTimeStart,
                end: historyTimeEnd,
                limit: 1,
                interval: 'raw'
            };
            
            console.log('查询参数:', JSON.stringify(options2));
            const result2 = await priceModel.getPriceHistory(testTokenId, options2);
            
            if (result2.history.length > 0) {
                console.log('查询结果:', {
                    价格: result2.history[0].price,
                    时间: result2.history[0].timestamp
                });
                
                // 计算与当前价格的差异
                if (latestPrice.price) {
                    const percentChange = ((latestPrice.price - result2.history[0].price) / result2.history[0].price) * 100;
                    console.log(`与当前价格的变化百分比: ${percentChange.toFixed(2)}%`);
                }
            } else {
                console.log('没有查询到历史价格');
            }
            
            // 3. 使用只有end参数的方法
            console.log('\n方法3: 只使用end参数');
            const endTime = moment.utc().subtract(timeframe, 'seconds').toISOString();
            
            const options3 = {
                end: endTime,
                limit: 1,
                interval: 'raw'
            };
            
            console.log('查询参数:', JSON.stringify(options3));
            const result3 = await priceModel.getPriceHistory(testTokenId, options3);
            
            if (result3.history.length > 0) {
                console.log('查询结果:', {
                    价格: result3.history[0].price,
                    时间: result3.history[0].timestamp
                });
                
                // 计算与当前价格的差异
                if (latestPrice.price) {
                    const percentChange = ((latestPrice.price - result3.history[0].price) / result3.history[0].price) * 100;
                    console.log(`与当前价格的变化百分比: ${percentChange.toFixed(2)}%`);
                }
            } else {
                console.log('没有查询到历史价格');
            }
            
            // 4. 测试新的getPriceAt方法
            console.log('\n方法4: 使用新的getPriceAt方法');
            const priceAtTime = await priceModel.getPriceAt(testTokenId, endTime);
            
            if (priceAtTime) {
                console.log('查询结果:', {
                    价格: priceAtTime.price,
                    时间: priceAtTime.timestamp
                });
                
                // 计算与当前价格的差异
                if (latestPrice.price) {
                    const percentChange = ((latestPrice.price - priceAtTime.price) / priceAtTime.price) * 100;
                    console.log(`与当前价格的变化百分比: ${percentChange.toFixed(2)}%`);
                }
            } else {
                console.log('没有查询到历史价格');
            }
        }
        
        console.log('\n====== 测试完成 ======');
    } catch (error) {
        console.error('测试失败:', error);
    }
}

// 运行测试
testAlertPriceQuery()
    .then(() => {
        console.log('测试完成');
        process.exit(0);
    })
    .catch(error => {
        console.error('测试失败:', error);
        process.exit(1);
    }); 