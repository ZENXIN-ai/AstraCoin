import fs from "fs";
import path from "path";

// 确保数据目录存在
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const proposalsFilePath = path.join(dataDir, "proposals.json");

// 初始化提案文件（如果不存在）
if (!fs.existsSync(proposalsFilePath)) {
  fs.writeFileSync(proposalsFilePath, "[]");
}

export default function handler(req, res) {
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

    // 检查文件是否存在
    if (!fs.existsSync(proposalsFilePath)) {
      return res.status(404).json({ 
        success: false,
        error: "数据文件不存在",
        details: "提案数据文件未找到"
      });
    }

    // 读取并解析提案数据
    let proposals = [];
    try {
      const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
      proposals = JSON.parse(fileContent);
    } catch (parseError) {
      console.error("解析提案文件失败:", parseError);
      return res.status(500).json({ 
        success: false,
        error: "数据文件损坏",
        details: "无法读取提案数据文件"
      });
    }

    // 查找提案 - 支持字符串和数字 ID
    let item = null;
    
    // 首先尝试精确匹配（字符串或数字）
    item = proposals.find(p => p.id == id); // 使用宽松相等匹配字符串和数字
    
    // 如果没找到，尝试转换为数字匹配（向后兼容）
    if (!item && !isNaN(Number(id))) {
      item = proposals.find(p => p.id === Number(id));
    }

    // 如果还是没找到，尝试字符串匹配
    if (!item) {
      item = proposals.find(p => p.id === id);
    }

    // 提案未找到
    if (!item) {
      return res.status(404).json({ 
        success: false,
        error: "提案未找到",
        details: `未找到 ID 为 ${id} 的提案`,
        code: "PROPOSAL_NOT_FOUND"
      });
    }

    // 返回提案数据
    return res.status(200).json({
      success: true,
      message: "获取提案成功",
      data: item
    });

  } catch (err) {
    console.error("获取提案错误:", err);
    
    // 错误响应
    const errorResponse = {
      success: false,
      error: "服务器内部错误",
      code: "GET_PROPOSAL_ERROR"
    };

    // 开发环境下返回详细错误
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
      errorResponse.stack = err.stack;
    }

    return res.status(500).json(errorResponse);
  }
}