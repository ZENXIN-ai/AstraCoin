// pages/api/getProposal.js
import fs from "fs";
import path from "path";
import { getEntityById } from "../../lib/milvus.js";

const proposalsFilePath = path.join(process.cwd(), "data", "proposals.json");

export default async function handler(req, res) {
  // 只允许 GET 请求
  if (req.method !== "GET") {
    return res.status(405).json({ 
      success: false,
      error: "方法不允许",
      details: "只支持 GET 请求"
    });
  }

  try {
    const { id } = req.query;

    // 验证 ID 参数
    if (!id) {
      return res.status(400).json({ 
        success: false,
        error: "缺少必要参数",
        details: "提案 ID 为必填参数"
      });
    }

    // 检查 ID 格式
    if (typeof id !== "string" || id.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "参数格式错误",
        details: "提案 ID 格式不正确"
      });
    }

    const proposalId = id.trim();

    // 1️⃣ 首先尝试从本地 JSON 文件获取完整提案数据
    let proposalData = null;
    if (fs.existsSync(proposalsFilePath)) {
      try {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        const proposals = JSON.parse(fileContent);
        proposalData = proposals.find(p => p.id === proposalId);
      } catch (fileError) {
        console.warn("读取提案文件失败:", fileError.message);
        // 继续尝试从向量数据库获取
      }
    }

    // 2️⃣ 如果本地文件没有找到，尝试从向量数据库获取
    if (!proposalData) {
      try {
        const vectorData = await getEntityById("proposals", proposalId);
        
        if (vectorData && vectorData.data && vectorData.data.length > 0) {
          proposalData = vectorData.data[0];
        }
      } catch (milvusError) {
        console.error("从向量数据库获取提案失败:", milvusError);
        // 继续处理，最终会返回404
      }
    }

    // 3️⃣ 如果两个数据源都没有找到
    if (!proposalData) {
      return res.status(404).json({ 
        success: false,
        error: "提案未找到",
        details: `未找到 ID 为 ${proposalId} 的提案`,
        code: "PROPOSAL_NOT_FOUND"
      });
    }

    // 4️⃣ 成功返回数据
    return res.status(200).json({
      success: true,
      message: "获取提案成功",
      data: proposalData
    });

  } catch (err) {
    console.error("获取提案详情错误:", err);
    
    // 更详细的错误响应
    const errorResponse = {
      success: false,
      error: "服务器内部错误",
      code: "GET_PROPOSAL_ERROR"
    };

    // 开发环境下返回详细错误信息
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
      errorResponse.stack = err.stack;
    }

    return res.status(500).json(errorResponse);
  }
}