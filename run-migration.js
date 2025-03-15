// 运行数据库迁移脚本
const path = require('path');
const { exec } = require('child_process');

console.log('开始运行数据库迁移...');

// 运行新的迁移脚本
exec('node src/db/migrations/003_add_alert_token_triggers.js', (error, stdout, stderr) => {
    if (error) {
        console.error(`执行错误: ${error.message}`);
        return;
    }
    
    if (stderr) {
        console.error(`标准错误: ${stderr}`);
        return;
    }
    
    console.log(`标准输出: ${stdout}`);
    console.log('数据库迁移完成！');
}); 