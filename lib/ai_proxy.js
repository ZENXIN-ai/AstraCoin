// lib/ai_proxy.js - DeepSeek API 适配版本
import fetch from "node-fetch";

const AI_PROXY_URL = (process.env.AI_PROXY_URL || "").replace(/\/+$/, "");
const AI_PROXY_KEY = process.env.AI_PROXY_KEY || "";

// DeepSeek 特定配置
const DEEPSEEK_CONFIG = {
  embeddingModel: "text-embedding", // DeepSeek 的嵌入模型
  chatModel: "deepseek-chat",       // DeepSeek 的聊天模型
  timeout: 30000,
  maxRetries: 2,
  retryDelay: 1000
};

function getHeaders() {
  const headers = { 
    "Content-Type": "application/json",
    "User-Agent": "AstraCoin-DApp/1.0.0"
  };
  
  if (AI_PROXY_KEY) {
    headers["Authorization"] = `Bearer ${AI_PROXY_KEY}`;
  }
  
  return headers;
}

/**
 * 带重试机制的 fetch 包装器
 */
async function fetchWithRetry(url, options, retries = DEEPSEEK_CONFIG.maxRetries) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEEPSEEK_CONFIG.timeout);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return response;
    }
    
    // 如果是服务器错误，进行重试
    if (response.status >= 500 && retries > 0) {
      console.warn(`DeepSeek API 请求失败，状态码: ${response.status}, 剩余重试次数: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, DEEPSEEK_CONFIG.retryDelay));
      return fetchWithRetry(url, options, retries - 1);
    }
    
    return response;
    
  } catch (error) {
    if (error.name === 'AbortError' && retries > 0) {
      console.warn(`DeepSeek API 请求超时，剩余重试次数: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, DEEPSEEK_CONFIG.retryDelay));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

/**
 * 生成文本向量嵌入 - DeepSeek 适配版本
 */
export async function getEmbedding(text, model = DEEPSEEK_CONFIG.embeddingModel) {
  // 输入验证
  if (!text || typeof text !== 'string') {
    throw new Error("文本输入无效: 必须为非空字符串");
  }
  
  if (text.trim().length === 0) {
    throw new Error("文本输入无效: 不能为空字符串");
  }
  
  if (!AI_PROXY_URL) {
    throw new Error("AI_PROXY_URL 环境变量未配置");
  }
  
  const url = `${AI_PROXY_URL}/embeddings`; // DeepSeek 的嵌入端点
  
  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ 
        input: text.trim(),
        model
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DeepSeek 嵌入请求失败: ${response.status}`, errorText);
      throw new Error(`DeepSeek 嵌入服务错误 ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    // DeepSeek 的响应格式
    let embedding = null;
    if (data.data && Array.isArray(data.data) && data.data[0] && data.data[0].embedding) {
      embedding = data.data[0].embedding;
    } else if (data.embedding) {
      embedding = data.embedding;
    }
    
    if (!embedding || !Array.isArray(embedding)) {
      console.error("无法解析 DeepSeek 嵌入响应:", data);
      throw new Error("无法解析 DeepSeek 嵌入响应: 响应格式无效");
    }
    
    console.log(`✅ 成功生成文本嵌入，维度: ${embedding.length}`);
    return embedding;
    
  } catch (error) {
    console.error("获取 DeepSeek 文本嵌入失败:", error.message);
    
    // 如果是配置错误，直接抛出
    if (error.message.includes("环境变量") || error.message.includes("未配置")) {
      throw error;
    }
    
    // 其他错误包装后抛出
    throw new Error(`DeepSeek 嵌入服务调用失败: ${error.message}`);
  }
}

/**
 * 为兼容性保留的别名
 */
export const embedText = getEmbedding;

/**
 * 使用 DeepSeek LLM 分析提案内容
 */
export async function analyzeWithLLM(title, content, options = {}) {
  // 输入验证
  if (!title || !content) {
    throw new Error("标题和内容为必填参数");
  }
  
  const { 
    model = DEEPSEEK_CONFIG.chatModel,
    maxTokens = 800,
    temperature = 0.1,
    language = "zh"
  } = options;
  
  // 如果没有配置 AI 代理，返回模拟数据
  if (!AI_PROXY_URL) {
    console.warn("AI_PROXY_URL 未配置，返回模拟分析结果");
    return {
      summary: `模拟摘要：这是一个关于"${title.substring(0, 50)}..."的提案分析。`,
      category: "general",
      risk: "medium",
      suggestions: [
        "建议进行更详细的技术评估",
        "考虑社区反馈机制",
        "制定实施时间表"
      ],
      confidence: 0.0,
      isFallback: true
    };
  }
  
  const url = `${AI_PROXY_URL}/chat/completions`; // DeepSeek 的聊天端点
  
  const prompt = `请分析以下提案并返回一个 JSON 对象，包含以下字段：
{
  "summary": "对提案的简洁中文摘要（50-120字）",
  "category": "代币经济/治理/技术/市场/社区/综合",
  "risk": "low/medium/high",
  "suggestions": ["具体建议1", "具体建议2", "具体建议3"],
  "confidence": 0.0到1.0之间的数值，表示分析置信度
}

要求：
1. 只返回 JSON，不要有其他文本
2. 摘要要突出核心内容和潜在影响
3. 风险评估要基于可行性、社区影响和潜在风险
4. 建议要具体可操作

提案标题：${title}
提案内容：${content}`;
  
  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature,
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DeepSeek 聊天请求失败: ${response.status}`, errorText);
      throw new Error(`DeepSeek 分析服务错误 ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    // DeepSeek 的响应格式
    const reply = data.choices?.[0]?.message?.content || "";
    
    if (!reply) {
      throw new Error("DeepSeek 返回空响应");
    }
    
    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(reply);
      
      // 验证必需字段
      const requiredFields = ["summary", "category", "risk", "suggestions"];
      const missingFields = requiredFields.filter(field => !parsed[field]);
      
      if (missingFields.length > 0) {
        console.warn("DeepSeek 响应缺少必需字段:", missingFields);
        return {
          summary: parsed.summary || `关于"${title}"的提案分析`,
          category: parsed.category || "general",
          risk: parsed.risk || "medium",
          suggestions: parsed.suggestions || ["请进行人工审核"],
          confidence: parsed.confidence || 0.5,
          hasMissingFields: true
        };
      }
      
      console.log("✅ DeepSeek 分析成功");
      return parsed;
      
    } catch (parseError) {
      console.warn("无法解析 DeepSeek JSON 响应，使用回退处理");
      
      // 尝试从文本中提取 JSON
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          // 如果还是失败，返回原始文本作为摘要
        }
      }
      
      // 最终回退：返回原始文本作为摘要
      return {
        summary: reply.length > 200 ? reply.substring(0, 200) + "..." : reply,
        category: "general",
        risk: "medium",
        suggestions: ["建议进行人工审核"],
        confidence: 0.1,
        isFallback: true,
        rawResponse: reply
      };
    }
    
  } catch (error) {
    console.error("DeepSeek 分析失败:", error.message);
    
    // 返回一个基本的分析结果
    return {
      summary: `DeepSeek 分析服务暂时不可用。提案标题: ${title.substring(0, 100)}...`,
      category: "general",
      risk: "medium",
      suggestions: ["AI 分析服务暂时不可用，请稍后重试或进行人工审核"],
      confidence: 0.0,
      isError: true,
      errorMessage: error.message
    };
  }
}

// 使用 Boolean() 替代 !! 避免 PrefixUnaryExpression 错误
export const config = {
  isConfigured: Boolean(AI_PROXY_URL),
  url: AI_PROXY_URL,
  hasKey: Boolean(AI_PROXY_KEY),
  defaultModels: {
    embedding: DEEPSEEK_CONFIG.embeddingModel,
    chat: DEEPSEEK_CONFIG.chatModel
  }
};