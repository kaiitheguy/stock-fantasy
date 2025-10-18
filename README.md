# Stock Fantasy

一个基于 React Native 的股票投资模拟应用，通过面向对象的服务层组织实时行情、AI 分析和投资决策逻辑。

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

### 服务依赖
- 自建或托管的行情聚合服务（兼容 Yahoo Finance 代理接口）
- AI 分析服务（默认使用远程 API_BASE）
- Render / Vercel 等可选部署平台

## 项目结构

```
stock-fantasy/
├── App.tsx                 # 主应用组件
├── services/StockDomain.ts # 股票领域模型与服务类
├── assets/               # 应用资源
├── ios/                  # iOS配置
└── package.json         # 前端依赖
```

## 开发环境设置

### 1. 安装依赖

```bash
npm install
```

### 2. 环境变量配置

在项目根目录创建 `.env` 文件，自定义后端基础地址（可选）：

```env
EXPO_PUBLIC_API_BASE=https://stock-fantasy-api.onrender.com
```

### 3. 启动开发服务器

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

## API 端点

前端通过 `EXPO_PUBLIC_API_BASE` 指向的后端服务访问以下接口：

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
在 `services/StockDomain.ts` 中的 `STOCK_UNIVERSE` 常量添加新股票：

```typescript
export const STOCK_UNIVERSE = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corp.' },
  // 添加新股票
  { ticker: 'NEW', name: 'New Company' },
] as const;
```

### 自定义 AI 分析
`AIInsightService` 通过 `POST /api/rationale` 请求 AI 观点。若需改写分析逻辑，可以：
- 在自建后端中调整提示词或业务规则，并部署为新的 API。
- 更新 `.env` 中的 `EXPO_PUBLIC_API_BASE` 指向新的服务地址。

### 样式定制
所有样式定义在 `App.tsx` 的 `styles` 对象中，可以自定义颜色、字体和布局。

### 服务层扩展
`services/StockDomain.ts` 聚合了应用的核心业务逻辑：
- `StockDeckService`：控制卡片批次生成与洗牌。
- `YahooFinanceService`：封装行情请求与容错处理。
- `AIInsightService`：统一管理 AI 分析请求。
- `SparklineBuilder`：生成迷你走势图的 SVG path。

你可以在此文件中扩展新的服务或覆写默认行为，让界面层保持简洁。

### 质量检查
开发过程中建议运行 TypeScript 检查，确保类型安全：

```bash
npx tsc --noEmit
```

## 故障排除

### 常见问题

1. **Yahoo Finance API 错误**
   - 检查网络连接
   - 验证股票代码是否正确

2. **AI 分析失败**
   - 确认 `EXPO_PUBLIC_API_BASE` 指向的服务可用
   - 检查后端日志或第三方 API 配额

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
