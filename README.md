# AstraCoin
# AstraCoin DApp (Astra DAO)

此仓库包含 AstraCoin 的前端静态页面与 Vercel Serverless API，用于 AI 驱动的 DAO 提案分析 + 向量检索（Zilliz / Milvus）。

## 快速开始

1. 在 Zilliz Cloud 创建实例并获取：
   - REST Endpoint (ZILLIZ_API_URL)，示例: `https://in03-xxxxx.serverless.aws-eu-central-1.cloud.zilliz.com`
   - API Key (ZILLIZ_API_KEY)

2. 在一个免费 AI 代理注册或使用你已有的 `AI_PROXY_URL`，例如 `https://api.openai-proxy.xyz`（请确认该代理兼容 `/v1/embeddings` 和 `/v1/chat/completions`）。

3. 在 Vercel 新建项目并连接到此仓库。然后在 **Project > Settings > Environment Variables** 填入：
   - `ZILLIZ_API_URL`
   - `ZILLIZ_API_KEY`
   - `AI_PROXY_URL`
   - `AI_PROXY_KEY`（如果需要）
   - `ADMIN_SECRET`（自定义）

4. 点击 Deploy。部署完成后访问站点：
   - `/` 首页
   - `/proposals.html` 提案列表
   - `/proposal.html?id=...` 提案详情
   - `/dashboard.html` 管理面板

## 开发
- `npm i`
- `npm run dev` 使用 `vercel dev` 本地调试（需要安装 Vercel CLI）

## 注意
- 当前投票系统为 off-chain（存储在 Zilliz）。若要链上投票或防刷票，请使用钱包签名验证或部署 on-chain Governor（我可以帮助）。
- 请不要在代码中泄露私钥或 API Key。