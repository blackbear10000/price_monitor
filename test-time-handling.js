// 测试时间处理
require('dotenv').config();
const moment = require('moment-timezone');
const db = require('./src/utils/database');
const priceModel = require('./src/models/price');
const alertModel = require('./src/models/alert');
const logger = require('./src/utils/logger');

// 设置日志级别为 debug
process.env.LOG_LEVEL = 'debug';

// 测试函数
async function testTimeHandling() {
    console.log('====== 时间处理测试开始 ======');
    console.log('系统时区:', process.env.TZ || '(未设置)');
    
    // 测试 1: 基础时间格式化
    console.log('\n----- 测试 1: 基础时间格式化 -----');
    
    const now = new Date();
    console.log('当前时间 (JS Date):', now);
    console.log('当前时间 (ISO):', now.toISOString());
    
    const utcFormatted = db.formatTimestamp(now);
    console.log('数据库格式化时间戳 (UTC):', utcFormatted);
    
    const momentUtc = moment.utc(now).format('YYYY-MM-DD HH:mm:ss');
    console.log('Moment UTC格式化:', momentUtc);
    
    const momentLocal = moment(now).format('YYYY-MM-DD HH:mm:ss');
    console.log('Moment 本地格式化:', momentLocal);
    
    // 测试 2: 价格历史查询
    console.log('\n----- 测试 2: 价格历史查询时间处理 -----');
    
    // 测试不同的时间格式和时区
    const testTimes = [
        { label: '当前时间', time: new Date() },
        { label: '当前时间 -1天', time: moment().subtract(1, 'day').toDate() },
        { label: 'ISO格式', time: moment().toISOString() },
        { label: 'ISO格式 -1天', time: moment().subtract(1, 'day').toISOString() },
        { label: 'YYYY-MM-DD格式', time: moment().format('YYYY-MM-DD') },
        { label: 'Unix时间戳', time: Math.floor(Date.now() / 1000) }
    ];
    
    for (const { label, time } of testTimes) {
        console.log(`\n测试时间 (${label}):`);
        console.log('原始值:', time);
        
        // 转换为UTC时间字符串
        const utcTime = moment.utc(time).format('YYYY-MM-DD HH:mm:ss');
        console.log('转换为UTC:', utcTime);
        
        // 转换为本地时间字符串
        const localTime = moment(time).format('YYYY-MM-DD HH:mm:ss');
        console.log('转换为本地时间:', localTime);
        
        // 测试在价格查询中的处理
        try {
            // 模拟价格查询的开始时间处理
            const startDate = time;
            console.log('模拟开始时间:', startDate);
            
            const utcStartDate = moment.utc(startDate).format('YYYY-MM-DD HH:mm:ss');
            console.log('UTC格式化后:', utcStartDate);
        } catch (error) {
            console.error('时间处理错误:', error.message);
        }
    }
    
    // 测试 3: 数据库时间查询
    console.log('\n----- 测试 3: 数据库时间查询 -----');
    
    try {
        // 测试直接查询最近的一条价格记录
        console.log('\n查询最近的价格记录:');
        const latestRecord = await db.get(
            'SELECT * FROM price_records ORDER BY timestamp DESC LIMIT 1'
        );
        
        if (latestRecord) {
            console.log('记录时间戳:', latestRecord.timestamp);
            console.log('时间戳类型:', typeof latestRecord.timestamp);
            
            // 解析记录时间戳
            const recordTime = moment.utc(latestRecord.timestamp);
            console.log('解析为UTC时间:', recordTime.format('YYYY-MM-DD HH:mm:ss'));
            console.log('转换为ISO:', recordTime.toISOString());
            console.log('转换为本地时间:', recordTime.local().format('YYYY-MM-DD HH:mm:ss'));
        } else {
            console.log('数据库中没有价格记录');
        }
        
        // 测试一个明确的时间范围查询
        console.log('\n测试时间范围查询:');
        const startDate = moment.utc().subtract(7, 'days').format('YYYY-MM-DD HH:mm:ss');
        const endDate = moment.utc().format('YYYY-MM-DD HH:mm:ss');
        
        console.log('开始时间 (UTC):', startDate);
        console.log('结束时间 (UTC):', endDate);
        
        const sql = `
            SELECT COUNT(*) as count FROM price_records
            WHERE timestamp BETWEEN ? AND ?
        `;
        
        const result = await db.get(sql, [startDate, endDate]);
        console.log('查询结果 (记录数):', result.count);
        
    } catch (error) {
        console.error('数据库查询错误:', error.message);
    }
    
    console.log('\n====== 时间处理测试结束 ======');
}

// 运行测试
testTimeHandling()
    .then(() => {
        console.log('测试完成');
        process.exit(0);
    })
    .catch(error => {
        console.error('测试失败:', error);
        process.exit(1);
    }); 