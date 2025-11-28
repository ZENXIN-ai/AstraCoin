import fs from "fs";
import path from "path";
import { embedText } from "../../../lib/ai_proxy.js";
import { milvusClient, collectionName } from "../../../lib/milvus.js";

// 确保数据目录存在
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const proposalsFilePath = path.join(dataDir, "proposals.json");

// 初始化 proposals.json 文件
if (!fs.existsSync(proposalsFilePath)) {
  fs.writeFileSync(proposalsFilePath, "[]");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, description, budget } = req.body;

  // 更严格的输入验证
  if (!title || !description) {
    return res.status(400).json({ 
      error: "缺少标题或内容",
      details: "标题和描述为必填字段"
    });
  }

  // 验证标题和描述长度
  if (title.length > 100) {
    return res.status(400).json({ 
      error: "标题过长",
      details: "标题不能超过100个字符" 
    });
  }

  if (description.length > 2000) {
    return res.status(400).json({ 
      error: "描述过长",
      details: "描述不能超过2000个字符" 
    });
  }

  try {
    // 1️⃣ 创建向量 embedding
    const text = `${title}\n${description}`;
    const vector = await embedText(text);

    if (!vector || !Array.isArray(vector)) {
      throw new Error("生成向量失败");
    }

    // 2️⃣ 创建提案对象（添加更多字段）
    const proposal = {
      id: `proposal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      description: description.trim(),
      budget: budget && !isNaN(budget) ? Number(budget) : 0,
      status: "pending", // 添加状态字段
      votes: 0, // 添加投票计数
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 3️⃣ 写入 JSON 数据库（使用更安全的文件操作）
    let proposals = [];
    try {
      const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
      proposals = JSON.parse(fileContent);
    } catch (fileError) {
      console.warn("读取提案文件失败，将创建新文件:", fileError.message);
      proposals = [];
    }

    proposals.push(proposal);
    
    // 使用临时文件避免数据损坏
    const tempFilePath = proposalsFilePath + '.tmp';
    fs.writeFileSync(tempFilePath, JSON.stringify(proposals, null, 2));
    fs.renameSync(tempFilePath, proposalsFilePath);

    // 4️⃣ 写入 Zilliz 向量数据库（添加错误处理）
    try {
      await milvusClient.insert({
        collection_name: collectionName,
        data: [
          {
            id: proposal.id,
            vector: vector,
            title: proposal.title, // 添加元数据便于查询
            created_at: Math.floor(Date.now() / 1000) // 时间戳格式
          }
        ]
      });
    } catch (milvusError) {
      console.error("向量数据库插入失败:", milvusError);
      // 可以考虑回滚文件写入，或者记录错误继续
    }

    return res.status(200).json({
      success: true,
      message: "提案提交成功",
      data: {
        proposalId: proposal.id,
        title: proposal.title,
        createdAt: proposal.createdAt
      }
    });

  } catch (err) {
    console.error("提案提交错误:", err);
    
    // 更详细的错误响应
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? err.message 
      : "服务器内部错误，请稍后重试";

    return res.status(500).json({ 
      success: false,
      error: errorMessage,
      code: "PROPOSAL_SUBMIT_ERROR"
    });
  }
}