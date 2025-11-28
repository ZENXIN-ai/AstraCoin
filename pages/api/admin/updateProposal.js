// pages/api/admin/updateProposal.js
import { updateEntityById, getEntityById } from "../../../lib/milvus.js";
import { embedText } from "../../../lib/ai_proxy.js";
import fs from "fs";
import path from "path";

// 本地提案文件路径
const proposalsFilePath = path.join(process.cwd(), "data", "proposals.json");

// 允许更新的字段列表（安全限制）
const ALLOWED_UPDATE_FIELDS = [
  'title', 'content', 'description', 'budget', 'status', 
  'votes', 'updatedAt', 'category', 'tags'
];

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== "POST") {
    return res.status(405).json({ 
      success: false,
      error: "方法不允许",
      details: "只支持 POST 请求",
      code: "METHOD_NOT_ALLOWED"
    });
  }

  try {
    // 1️⃣ 管理员身份验证
    const adminSecret = process.env.ADMIN_SECRET;
    
    if (!adminSecret) {
      console.error("ADMIN_SECRET 环境变量未设置");
      return res.status(500).json({ 
        success: false,
        error: "服务器配置错误",
        details: "管理员密钥未配置",
        code: "ADMIN_SECRET_NOT_CONFIGURED"
      });
    }

    const providedSecret = req.headers['x-admin-secret'] || req.body.admin_secret;
    
    if (!providedSecret) {
      return res.status(401).json({ 
        success: false,
        error: "未授权访问",
        details: "需要管理员密钥",
        code: "MISSING_ADMIN_SECRET"
      });
    }

    if (providedSecret !== adminSecret) {
      console.warn("管理员密钥验证失败");
      return res.status(403).json({ 
        success: false,
        error: "禁止访问",
        details: "管理员密钥无效",
        code: "INVALID_ADMIN_SECRET"
      });
    }

    // 2️⃣ 验证输入参数
    const { id, fields } = req.body;

    if (!id) {
      return res.status(400).json({ 
        success: false,
        error: "缺少必要参数",
        details: "提案 ID 为必填参数",
        code: "MISSING_PROPOSAL_ID"
      });
    }

    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "缺少更新字段",
        details: "需要提供要更新的字段",
        code: "MISSING_UPDATE_FIELDS"
      });
    }

    // 3️⃣ 验证字段权限（只允许更新指定字段）
    const invalidFields = Object.keys(fields).filter(
      field => !ALLOWED_UPDATE_FIELDS.includes(field)
    );

    if (invalidFields.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: "不允许更新的字段",
        details: `字段 [${invalidFields.join(', ')}] 不允许更新`,
        code: "INVALID_UPDATE_FIELDS"
      });
    }

    // 4️⃣ 检查提案是否存在并获取当前数据
    let currentProposal = null;
    
    // 先检查本地文件
    if (fs.existsSync(proposalsFilePath)) {
      try {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        const proposals = JSON.parse(fileContent);
        currentProposal = proposals.find(p => p.id == id);
      } catch (fileError) {
        console.error("读取提案文件失败:", fileError);
      }
    }

    // 如果本地文件没找到，检查向量数据库
    if (!currentProposal) {
      try {
        const existing = await getEntityById("proposals", id);
        if (existing && existing.data && existing.data.length > 0) {
          currentProposal = { 
            id: id, 
            existsInMilvus: true,
            ...existing.data[0] 
          };
        }
      } catch (milvusError) {
        console.error("检查提案存在性失败:", milvusError);
      }
    }

    if (!currentProposal) {
      return res.status(404).json({ 
        success: false,
        error: "提案未找到",
        details: `未找到 ID 为 ${id} 的提案`,
        code: "PROPOSAL_NOT_FOUND"
      });
    }

    // 5️⃣ 准备更新数据
    const updateData = {
      ...fields,
      updatedAt: new Date().toISOString()
    };

    // 6️⃣ 如果更新了标题或内容，需要重新生成向量
    let newVector = null;
    const textFieldsUpdated = fields.title || fields.content || fields.description;
    
    if (textFieldsUpdated) {
      try {
        const textToEmbed = [
          fields.title || currentProposal.title,
          fields.content || currentProposal.content || currentProposal.description
        ].join('\n');
        
        newVector = await embedText(textToEmbed);
        updateData.vector = newVector;
        
        console.log(`为提案 ${id} 重新生成向量，维度: ${newVector.length}`);
      } catch (embeddingError) {
        console.error("重新生成向量失败:", embeddingError);
        // 继续更新其他字段，但不更新向量
        delete updateData.vector;
      }
    }

    // 7️⃣ 更新向量数据库
    let milvusUpdateResult = null;
    try {
      milvusUpdateResult = await updateEntityById("proposals", id, updateData);
    } catch (milvusError) {
      console.error("更新向量数据库失败:", milvusError);
      // 继续处理本地文件更新
    }

    // 8️⃣ 更新本地 JSON 文件
    let fileUpdateResult = null;
    if (fs.existsSync(proposalsFilePath) && currentProposal) {
      try {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        const proposals = JSON.parse(fileContent);
        
        const proposalIndex = proposals.findIndex(p => p.id == id);
        if (proposalIndex !== -1) {
          // 合并更新字段
          proposals[proposalIndex] = {
            ...proposals[proposalIndex],
            ...updateData
          };
          
          fileUpdateResult = proposals[proposalIndex];
          
          // 使用临时文件确保数据完整性
          const tempPath = proposalsFilePath + '.tmp';
          fs.writeFileSync(tempPath, JSON.stringify(proposals, null, 2));
          fs.renameSync(tempPath, proposalsFilePath);
        }
      } catch (fileError) {
        console.error("更新本地文件失败:", fileError);
      }
    }

    // 9️⃣ 记录更新操作
    console.log(`管理员更新提案: ID=${id}, 更新时间=${new Date().toISOString()}, 更新字段=[${Object.keys(fields).join(', ')}]`);

    // 🔟 返回成功响应
    const responseData = {
      success: true,
      message: "提案更新成功",
      data: {
        proposalId: id,
        updatedFields: Object.keys(fields),
        updatedAt: updateData.updatedAt,
        vectorRegenerated: !!newVector
      }
    };

    // 包含更新结果
    if (milvusUpdateResult) {
      responseData.data.milvusResult = milvusUpdateResult;
    }
    
    if (fileUpdateResult) {
      responseData.data.fileResult = {
        title: fileUpdateResult.title,
        updatedAt: fileUpdateResult.updatedAt
      };
    }

    // 检查是否至少一个数据源更新成功
    if (!milvusUpdateResult && !fileUpdateResult) {
      return res.status(500).json({ 
        success: false,
        error: "更新操作失败",
        details: "无法更新任何数据源",
        code: "UPDATE_OPERATION_FAILED"
      });
    }

    return res.status(200).json(responseData);

  } catch (err) {
    console.error("管理员更新提案错误:", err);
    
    // 错误响应
    const errorResponse = {
      success: false,
      error: "更新提案失败",
      code: "UPDATE_PROPOSAL_ERROR"
    };

    // 开发环境下返回详细错误
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
      errorResponse.stack = err.stack;
    }

    return res.status(500).json(errorResponse);
  }
}