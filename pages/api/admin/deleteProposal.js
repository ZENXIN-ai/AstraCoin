// pages/api/admin/deleteProposal.js
import { deleteEntityById, getEntityById } from "../../../lib/milvus.js";
import fs from "fs";
import path from "path";

// 本地提案文件路径
const proposalsFilePath = path.join(process.cwd(), "data", "proposals.json");

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

    // 支持从 header 或 body 获取密钥
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

    // 2️⃣ 验证提案 ID
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ 
        success: false,
        error: "缺少必要参数",
        details: "提案 ID 为必填参数",
        code: "MISSING_PROPOSAL_ID"
      });
    }

    // 3️⃣ 检查提案是否存在
    let proposalInfo = null;
    
    // 先检查本地文件
    if (fs.existsSync(proposalsFilePath)) {
      try {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        const proposals = JSON.parse(fileContent);
        proposalInfo = proposals.find(p => p.id == id);
      } catch (fileError) {
        console.error("读取提案文件失败:", fileError);
      }
    }

    // 如果本地文件没找到，检查向量数据库
    if (!proposalInfo) {
      try {
        const existing = await getEntityById("proposals", id);
        if (existing && existing.data && existing.data.length > 0) {
          proposalInfo = { id: id, existsInMilvus: true };
        }
      } catch (milvusError) {
        console.error("检查提案存在性失败:", milvusError);
      }
    }

    if (!proposalInfo) {
      return res.status(404).json({ 
        success: false,
        error: "提案未找到",
        details: `未找到 ID 为 ${id} 的提案`,
        code: "PROPOSAL_NOT_FOUND"
      });
    }

    // 4️⃣ 从向量数据库中删除提案
    let milvusDeleteResult = null;
    try {
      milvusDeleteResult = await deleteEntityById("proposals", id);
    } catch (milvusError) {
      console.error("从向量数据库删除提案失败:", milvusError);
      // 继续处理本地文件删除，但记录错误
    }

    // 5️⃣ 从本地 JSON 文件中删除提案
    let fileDeleteResult = null;
    if (fs.existsSync(proposalsFilePath)) {
      try {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        const proposals = JSON.parse(fileContent);
        
        const initialLength = proposals.length;
        const filteredProposals = proposals.filter(p => p.id != id);
        const deletedCount = initialLength - filteredProposals.length;
        
        if (deletedCount > 0) {
          // 使用临时文件确保数据完整性
          const tempPath = proposalsFilePath + '.tmp';
          fs.writeFileSync(tempPath, JSON.stringify(filteredProposals, null, 2));
          fs.renameSync(tempPath, proposalsFilePath);
          
          fileDeleteResult = {
            deletedCount: deletedCount,
            remainingCount: filteredProposals.length
          };
        }
      } catch (fileError) {
        console.error("从本地文件删除提案失败:", fileError);
      }
    }

    // 6️⃣ 记录删除操作（可选，实际应用中可写入日志系统）
    console.log(`管理员删除提案: ID=${id}, 时间=${new Date().toISOString()}`);

    // 7️⃣ 返回成功响应
    const responseData = {
      success: true,
      message: "提案删除成功",
      data: {
        proposalId: id,
        deletedFrom: []
      }
    };

    // 记录删除来源
    if (milvusDeleteResult) {
      responseData.data.deletedFrom.push("milvus");
      responseData.data.milvusResult = milvusDeleteResult;
    }
    
    if (fileDeleteResult) {
      responseData.data.deletedFrom.push("local_file");
      responseData.data.fileResult = fileDeleteResult;
    }

    // 如果两边都删除失败
    if (responseData.data.deletedFrom.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: "删除操作失败",
        details: "无法从任何数据源删除提案",
        code: "DELETE_OPERATION_FAILED"
      });
    }

    return res.status(200).json(responseData);

  } catch (err) {
    console.error("管理员删除提案错误:", err);
    
    // 错误响应
    const errorResponse = {
      success: false,
      error: "删除提案失败",
      code: "DELETE_PROPOSAL_ERROR"
    };

    // 开发环境下返回详细错误
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
      errorResponse.stack = err.stack;
    }

    return res.status(500).json(errorResponse);
  }
}