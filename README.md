 # 区块链价格监控工具

一个基于Node.js的区块链价格监控工具，能够实时获取加密货币价格，设置价格告警条件，并在满足条件时通过Telegram Bot发送告警通知。

## 功能特点

- 实时获取加密货币价格
- 支持多种告警条件（固定价格、涨跌幅）
- 灵活的告警配置（全局告警和代币特定告警）
- Telegram Bot通知集成
- 完整的RESTful API接口
- 数据历史记录和统计
- 自动数据清理

## 安装与配置

### 前置条件

- Node.js 14.x 或更高版本
- npm 或 yarn

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/blackbear10000/price_monitor.git
cd price_monitor
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

复制`.env.example`文件为`.env`，并根据需要修改配置：

```bash
cp .env.example .env
```

主要配置项：

- `API_KEY`: API访问密钥
- `TELEGRAM_BOT_TOKEN`: Telegram Bot的API令牌
- `TELEGRAM_CHAT_ID`: 接收告警通知的Telegram聊天ID
- `PRICE_UPDATE_INTERVAL`: 价格更新周期（秒）
- `DATABASE_PATH`: 数据库文件路径

4. 配置代币和告警

在`config`目录下创建`tokens.json`和`alerts.json`文件，或者通过API接口添加。

### 启动应用

```bash
npm start
```

## API接口

### 代币管理

- `GET /api/tokens` - 获取所有代币列表
- `GET /api/tokens/:id` - 获取特定代币详情
- `POST /api/tokens` - 添加新代币
- `PUT /api/tokens/:id` - 更新代币信息
- `DELETE /api/tokens/:id` - 删除代币
- `POST /api/tokens/batch` - 批量添加代币

### 价格数据

- `GET /api/prices` - 获取所有代币最新价格
- `GET /api/prices/:id` - 获取特定代币最新价格
- `GET /api/prices/:id/history` - 获取特定代币的价格历史
- `GET /api/prices/:id/stats` - 获取价格统计数据
- `POST /api/prices/refresh/:id` - 手动刷新特定代币价格
- `POST /api/prices/refresh` - 手动刷新所有代币价格

### 告警配置

- `GET /api/alerts` - 获取所有告警配置
- `GET /api/alerts/global` - 获取全局告警配置
- `GET /api/alerts/token/:id` - 获取特定代币的告警配置
- `POST /api/alerts/global` - 添加全局告警
- `POST /api/alerts/token/:id` - 添加特定代币告警
- `PUT /api/alerts/:alertId` - 更新告警配置
- `DELETE /api/alerts/:alertId` - 删除告警配置
- `POST /api/alerts/batch` - 批量添加告警
- `GET /api/alerts/history` - 获取告警历史记录
- `GET /api/alerts/statistics` - 获取告警统计数据

### 系统管理

- `GET /api/system/status` - 获取系统状态信息
- `GET /api/system/configuration` - 获取当前系统配置
- `GET /api/system/logs` - 获取系统日志
- `GET /api/system/health` - 健康检查接口
- `POST /api/system/maintenance/cleanup` - 触发数据清理

## 认证

所有API请求需要在请求头中包含API密钥：

```
X-API-Key: your_api_key_here
```

## 开发

### 项目结构

```
price_monitor/
├── src/
│   ├── config/               # 配置文件
│   ├── models/               # 数据模型
│   ├── services/             # 业务逻辑
│   ├── api/                  # API接口
│   │   ├── routes/           # 路由定义
│   │   ├── controllers/      # 控制器
│   │   └── middleware/       # 中间件
│   ├── utils/                # 工具函数
│   ├── db/                   # 数据库相关
│   └── app.js                # 应用入口
├── config/                   # 外部配置目录
├── data/                     # 数据存储目录
├── logs/                     # 日志目录
├── .env                      # 环境变量
└── package.json              # 项目依赖
```

### 运行测试

```bash
npm test
```

## 许可证

MIT