// pages/api/searchSimilar.js
import { searchVectors } from "../../lib/milvus.js";
import { getEmbedding, embedText } from "../../lib/ai_proxy.js";
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
    const { text, topK = 5 } = req.body;

    // 输入验证
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: "缺少必要参数",
        details: "搜索文本为必填参数且必须为字符串",
        code: "MISSING_SEARCH_TEXT"
      });
    }

    if (text.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "搜索文本为空",
        details: "搜索文本不能为空",
        code: "EMPTY_SEARCH_TEXT"
      });
    }

    // 验证 topK 参数
    const topKNum = parseInt(topK);
    if (isNaN(topKNum) || topKNum < 1 || topKNum > 50) {
      return res.status(400).json({ 
        success: false,
        error: "参数格式错误",
        details: "topK 必须是 1-50 之间的整数",
        code: "INVALID_TOPK_PARAMETER"
      });
    }

    // 1️⃣ 生成文本向量嵌入
    let vector;
    try {
      // 使用 embedText 或 getEmbedding（根据您的实际函数名调整）
      vector = await embedText(text.trim());
      // 或者: vector = await getEmbedding(text.trim());
      
      if (!vector || !Array.isArray(vector) || vector.length === 0) {
        throw new Error("生成的向量为空或格式错误");
      }
    } catch (embeddingError) {
      console.error("生成向量嵌入失败:", embeddingError);
      return res.status(500).json({ 
        success: false,
        error: "文本处理失败",
        details: "无法生成文本向量表示",
        code: "EMBEDDING_GENERATION_FAILED"
      });
    }

    // 2️⃣ 在向量数据库中搜索相似提案
    let searchResults;
    try {
      searchResults = await searchVectors("proposals", vector, topKNum);
      
      if (!searchResults || !Array.isArray(searchResults)) {
        throw new Error("搜索返回结果格式错误");
      }
    } catch (searchError) {
      console.error("向量搜索失败:", searchError);
      return res.status(500).json({ 
        success: false,
        error: "搜索失败",
        details: "向量数据库搜索过程中发生错误",
        code: "VECTOR_SEARCH_FAILED"
      });
    }

    // 3️⃣ 从本地文件获取完整的提案信息
    let fullProposals = [];
    try {
      if (fs.existsSync(proposalsFilePath)) {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        fullProposals = JSON.parse(fileContent);
      }
    } catch (fileError) {
      console.warn("读取本地提案文件失败:", fileError);
      // 继续处理，使用向量数据库返回的基础信息
    }

    // 4️⃣ 合并搜索结果与完整提案信息
    const enrichedResults = searchResults.map(result => {
      // 从向量搜索结果中提取基本信息
      const baseInfo = {
        id: result.id,
        score: result.score || result.distance, // 相似度分数
        title: result.title || '未知标题'
      };

      // 尝试从本地文件获取完整信息
      const fullProposal = fullProposals.find(p => p.id == baseInfo.id);
      
      if (fullProposal) {
        return {
          ...baseInfo,
          title: fullProposal.title || baseInfo.title,
          content: fullProposal.content || fullProposal.description,
          summary: (fullProposal.content || fullProposal.description || '').slice(0, 150) + '...',
          budget: fullProposal.budget || 0,
          status: fullProposal.status || 'pending',
          votes: fullProposal.votes || 0,
          createdAt: fullProposal.createdAt || fullProposal.created_at,
          similarity: (1 - (baseInfo.score || 0)).toFixed(4) // 转换为相似度百分比
        };
      }

      // 如果没有找到完整信息，返回基础信息
      return {
        ...baseInfo,
        summary: '详细信息暂不可用',
        similarity: (1 - (baseInfo.score || 0)).toFixed(4)
      };
    });

    // 5️⃣ 过滤掉无效结果并按相似度排序
    const validResults = enrichedResults
      .filter(result => result.id && result.title !== '未知标题')
      .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity));

    // 6️⃣ 返回成功响应
    return res.status(200).json({
      success: true,
      message: "相似提案搜索成功",
      data: {
        query: text.trim(),
        results: validResults,
        total: validResults.length,
        searchParams: {
          topK: topKNum,
          vectorDimension: vector.length
        }
      }
    });

  } catch (err) {
    console.error("相似提案搜索错误:", err);
    
    // 错误响应
    const errorResponse = {
      success: false,
      error: "搜索相似提案失败",
      code: "SEARCH_SIMILAR_PROPOSALS_ERROR"
    };

    // 开发环境下返回详细错误
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
      errorResponse.stack = err.stack;
    }

    return res.status(500).json(errorResponse);
  }
}