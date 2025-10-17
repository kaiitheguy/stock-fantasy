# Stock Fantasy

一个基于React Native的股票投资模拟应用，支持实时股票数据、AI分析和投资决策。

## 功能特性

- 📈 **实时股票数据** - 基于Yahoo Finance API的实时价格和图表
- 🤖 **AI投资分析** - OpenAI驱动的智能投资建议
- 💰 **投资模拟** - 虚拟投资组合管理
- 📱 **流畅体验** - 卡片式滑动交互
- 🎯 **数据缓存** - 智能预加载和缓存机制

## 技术栈

### 前端
- React Native (Expo)
- TypeScript
- React Native Animated
- React Native SVG

### 后端
- Node.js
- Express
- Yahoo Finance API
- OpenAI API

## 项目结构

```
stock-fantasy/
├── App.tsx                 # 主应用组件
├── backend/               # 后端服务
│   ├── server.js         # Express服务器
│   └── package.json      # 后端依赖
├── assets/               # 应用资源
├── ios/                  # iOS配置
└── package.json         # 前端依赖
```

## 开发环境设置

### 1. 安装依赖

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend
npm install
```

### 2. 环境变量配置

创建 `.env` 文件在 `backend/` 目录下：

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

### 3. 启动开发服务器

#### 启动后端服务
```bash
cd backend
npm start
```

#### 启动前端应用
```bash
npm start
```

## 生产部署

### iOS 应用发布

#### 1. 登录 EAS
```bash
npx eas login
```

#### 2. 更新版本号
手动编辑 `app.json` 文件：
```json
{
  "expo": {
    "version": "1.0.1",
    "ios": {
      "buildNumber": "2"
    }
  }
}
```

#### 3. 生产构建
```bash
eas build -p ios --profile production
```

#### 4. 提交到 TestFlight
```bash
eas submit -p ios --latest
```

### 后端部署

#### 部署到 Render.com

1. 连接 GitHub 仓库到 Render
2. 设置环境变量：
   - `OPENAI_API_KEY`: 你的 OpenAI API 密钥
   - `PORT`: 3000

3. 构建命令：
```bash
cd backend && npm install
```

4. 启动命令：
```bash
npm start
```

#### 本地后端测试
```bash
cd backend
npm start
```

后端服务将在 `http://localhost:3000` 启动

## API 端点

### 健康检查
```
GET /api/health
```

### 股票数据
```
GET /api/yahoo?symbol=AAPL
```

### AI 分析
```
POST /api/rationale
Content-Type: application/json

{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "price": 150.00,
  "changePct": 2.5
}
```

## 开发指南

### 添加新股票
在 `App.tsx` 中的 `STOCK_UNIVERSE` 数组添加新股票：

```typescript
const STOCK_UNIVERSE: readonly StockDescriptor[] = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corp.' },
  // 添加新股票
  { ticker: 'NEW', name: 'New Company' },
] as const;
```

### 自定义 AI 分析
修改 `backend/server.js` 中的 AI 提示词：

```javascript
const system = 'You are an equity analyst. Be neutral, concise, and factual.';
```

### 样式定制
所有样式定义在 `App.tsx` 的 `styles` 对象中，可以自定义颜色、字体和布局。

## 故障排除

### 常见问题

1. **Yahoo Finance API 错误**
   - 检查网络连接
   - 验证股票代码是否正确

2. **AI 分析失败**
   - 确认 OpenAI API 密钥正确
   - 检查 API 配额

3. **构建失败**
   - 确保所有依赖已安装
   - 检查 EAS 登录状态

### 调试模式

启用详细日志：
```bash
# 前端
DEBUG=* npm start

# 后端
DEBUG=* npm start
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

如有问题或建议，请创建 Issue 或联系开发团队。

---

**注意**: 这是一个教育项目，不构成实际投资建议。所有投资决策请谨慎考虑。
