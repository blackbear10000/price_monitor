const { Telegraf } = require('telegraf');
require('dotenv').config();

async function testTelegram() {
  try {
    console.log('正在测试Telegram连接...');
    console.log('Bot Token:', process.env.TELEGRAM_BOT_TOKEN ? '已设置' : '未设置');
    console.log('Chat ID:', process.env.TELEGRAM_CHAT_ID ? '已设置' : '未设置');
    
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    
    // 测试发送消息
    console.log('尝试发送消息...');
    const result = await bot.telegram.sendMessage(
      process.env.TELEGRAM_CHAT_ID,
      '🧪 这是一条测试消息，时间: ' + new Date().toISOString()
    );
    
    console.log('发送成功!', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('测试失败!');
    console.error('错误信息:', error.message);
    if (error.response) {
      console.error('API响应:', error.response.description);
    }
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
testTelegram(); 