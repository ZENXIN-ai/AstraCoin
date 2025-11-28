import fs from "fs";
import path from "path";
import { milvusClient, collectionName } from "../../../lib/milvus";
import { embedText } from "../../../lib/ai_proxy";

// 确保数据目录存在
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "proposals.json");

// 初始化提案文件
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, "[]");
}

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== "POST") {
    return res.status(405).json({ 
      success: false,
      error: "方法不允许",
      details: "只支持 POST 请求"
    });
  }

  try {
    const { title, content, budget = 0 } = req.body;

    // 输入验证
    if (!title || !content) {
      return res.status(400).json({ 
        success: false,
        error: "缺少必要字段",
        details: "标题和内容为必填字段"
      });
    }

    // 验证字段长度
    if (title.length > 100) {
      return res.status(400).json({
        success: false,
        error: "标题过长",
        details: "标题不能超过100个字符"
      });
    }

    if (content.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "内容过长",
        details: "内容不能超过5000个字符"
      });
    }

    // 验证预算格式
    const numericBudget = Number(budget);
    if (isNaN(numericBudget) || numericBudget < 0) {
      return res.status(400).json({
        success: false,
        error: "预算格式错误",
        details: "预算必须为非负数"
      });
    }

    // 1️⃣ 生成向量嵌入
    const text = `${title}\n${content}`;
    const embedding = await embedText(text);

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("生成向量嵌入失败");
    }

    // 2️⃣ 读取现有提案并生成新ID
    let proposals = [];
    try {
      const raw = fs.readFileSync(dbPath, "utf8");
      proposals = JSON.parse(raw);
    } catch (error) {
      console.error("读取提案文件失败:", error);
      // 如果文件损坏，重置为空数组
      proposals = [];
    }

    // 生成新ID - 使用递增ID但确保唯一性
    let newId = 1;
    if (proposals.length > 0) {
      const maxId = Math.max(...proposals.map(p => p.id));
      newId = maxId + 1;
    }

    // 3️⃣ 创建提案对象
    const newProposal = {
      id: newId,
      title: title.trim(),
      content: content.trim(),
      budget: numericBudget,
      status: "pending", // 添加状态字段
      votes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 4️⃣ 先写入向量数据库（Milvus）
    try {
      await milvusClient.insert({
        collection_name: collectionName,
        data: [
          {
            id: newId.toString(), // 确保ID为字符串
            vector: embedding,
            title: newProposal.title,
            created_at: Math.floor(Date.now() / 1000)
          }
        ]
      });
    } catch (milvusError) {
      console.error("向量数据库插入失败:", milvusError);
      throw new Error(`向量数据库操作失败: ${milvusError.message}`);
    }

    // 5️⃣ 再写入本地 JSON 数据库
    proposals.push(newProposal);
    
    // 使用临时文件确保数据完整性
    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(proposals, null, 2));
    fs.renameSync(tempPath, dbPath);

    // 6️⃣ 返回成功响应
    return res.status(201).json({
      success: true,
      message: "提案创建成功",
      data: {
        id: newId,
        title: newProposal.title,
        createdAt: newProposal.createdAt
      }
    });

  } catch (err) {
    console.error("创建提案错误:", err);
    
    // 错误响应
    const errorResponse = {
      success: false,
      error: "创建提案失败",
      code: "CREATE_PROPOSAL_ERROR"
    };

    // 开发环境下返回详细错误
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
    }

    return res.status(500).json(errorResponse);
  }
}