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
    // 检查文件是否存在
    if (!fs.existsSync(proposalsFilePath)) {
      return res.status(200).json({
        success: true,
        message: "暂无提案数据",
        data: [],
        total: 0
      });
    }

    // 读取并解析提案数据
    let list = [];
    try {
      const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
      list = JSON.parse(fileContent);
    } catch (parseError) {
      console.error("解析提案文件失败:", parseError);
      return res.status(500).json({ 
        success: false,
        error: "数据文件损坏",
        details: "无法读取提案数据文件",
        code: "DATA_FILE_CORRUPTED"
      });
    }

    // 验证数据格式
    if (!Array.isArray(list)) {
      console.error("提案数据格式错误，期望数组但得到:", typeof list);
      list = [];
    }

    // 按创建时间排序（最新在最前）
    const sortedList = [...list].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0);
      const dateB = new Date(b.createdAt || b.created_at || 0);
      return dateB - dateA;
    });

    // 支持分页参数
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // 计算分页
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedList = sortedList.slice(startIndex, endIndex);

    // 格式化返回数据（摘要信息）
    const formatted = paginatedList.map(p => {
      // 安全地生成摘要
      const content = p.content || p.description || '';
      const summary = content.length > 100 
        ? content.slice(0, 100) + "..." 
        : content;

      return {
        id: p.id,
        title: p.title || '无标题',
        summary: summary,
        budget: p.budget || 0,
        status: p.status || 'pending',
        votes: p.votes || 0,
        createdAt: p.createdAt || p.created_at,
        updatedAt: p.updatedAt || p.created_at
      };
    });

    // 返回成功响应
    return res.status(200).json({
      success: true,
      message: "获取提案列表成功",
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: sortedList.length,
        totalPages: Math.ceil(sortedList.length / limitNum),
        hasNext: endIndex < sortedList.length,
        hasPrev: startIndex > 0
      }
    });

  } catch (err) {
    console.error("获取提案列表错误:", err);
    
    // 错误响应
    const errorResponse = {
      success: false,
      error: "获取提案列表失败",
      code: "GET_PROPOSALS_ERROR"
    };

    // 开发环境下返回详细错误
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
      errorResponse.stack = err.stack;
    }

    return res.status(500).json(errorResponse);
  }
}