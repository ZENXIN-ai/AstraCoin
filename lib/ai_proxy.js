// lib/ai_proxy.js
import fetch from "node-fetch";

const AI_PROXY_URL = (process.env.AI_PROXY_URL || "").replace(/\/+$/, "");
const AI_PROXY_KEY = process.env.AI_PROXY_KEY || "";

// 默认配置
const DEFAULT_CONFIG = {
  embeddingModel: "text-embedding-3-small",
  chatModel: "gpt-4o-mini",
  timeout: 30000, // 30秒超时
  maxRetries: 2,  // 最大重试次数
  retryDelay: 1000 // 重试延迟
};

// 缓存配置（可选）
const ENABLE_CACHE = process.env.AI_CACHE_ENABLED === "true";
const embeddingCache = new Map();

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
async function fetchWithRetry(url, options, retries = DEFAULT_CONFIG.maxRetries) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_CONFIG.timeout);
    
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
      console.warn(`AI 代理请求失败，状态码: ${response.status}, 剩余重试次数: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay));
      return fetchWithRetry(url, options, retries - 1);
    }
    
    return response;
    
  } catch (error) {
    if (error.name === 'AbortError' && retries > 0) {
      console.warn(`AI 代理请求超时，剩余重试次数: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

/**
 * 生成文本向量嵌入
 * @param {string} text - 要嵌入的文本
 * @param {string} model - 使用的模型
 * @returns {Promise<number[]>} 向量数组
 */
export async function getEmbedding(text, model = DEFAULT_CONFIG.embeddingModel) {
  // 输入验证
  if (!text || typeof text !== 'string') {
    throw new Error("文本输入无效: 必须为非空字符串");
  }
  
  if (text.trim().length === 0) {
    throw new Error("文本输入无效: 不能为空字符串");
  }
  
  // 检查缓存（如果启用）
  const cacheKey = `${model}:${text}`;
  if (ENABLE_CACHE && embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }
  
  if (!AI_PROXY_URL) {
    throw new Error("AI_PROXY_URL 环境变量未配置");
  }
  
  const url = `${AI_PROXY_URL}/v1/embeddings`;
  
  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ 
        input: text.trim(),
        model,
        encoding_format: "float" // 明确指定格式
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI 代理嵌入请求失败: ${response.status}`, {
        url,
        status: response.status,
        error: errorText,
        textLength: text.length
      });
      
      throw new Error(`嵌入服务错误 ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    // 多种响应格式支持
    let embedding = null;
    if (data.data && Array.isArray(data.data) && data.data[0] && data.data[0].embedding) {
      embedding = data.data[0].embedding;
    } else if (data.embeddings && Array.isArray(data.embeddings) && data.embeddings[0] && data.embeddings[0].embedding) {
      embedding = data.embeddings[0].embedding;
    } else if (data.embedding) {
      embedding = data.embedding;
    }
    
    if (!embedding || !Array.isArray(embedding)) {
      console.error("无法解析嵌入响应:", data);
      throw new Error("无法解析嵌入响应: 响应格式无效");
    }
    
    // 验证向量维度
    if (embedding.length === 0) {
      throw new Error("生成的向量为空");
    }
    
    // 缓存结果（如果启用）
    if (ENABLE_CACHE) {
      embeddingCache.set(cacheKey, embedding);
      // 简单的大小限制，防止内存泄漏
      if (embeddingCache.size > 1000) {
        const firstKey = embeddingCache.keys().next().value;
        embeddingCache.delete(firstKey);
      }
    }
    
    return embedding;
    
  } catch (error) {
    console.error("获取文本嵌入失败:", {
      error: error.message,
      textLength: text.length,
      model
    });
    
    // 如果是配置错误，直接抛出
    if (error.message.includes("环境变量") || error.message.includes("未配置")) {
      throw error;
    }
    
    // 其他错误包装后抛出
    throw new Error(`嵌入服务调用失败: ${error.message}`);
  }
}

/**
 * 为兼容性保留的别名
 */
export const embedText = getEmbedding;

/**
 * 使用 LLM 分析提案内容
 * @param {string} title - 提案标题
 * @param {string} content - 提案内容
 * @param {object} options - 分析选项
 * @returns {Promise<object>} 分析结果
 */
export async function analyzeWithLLM(title, content, options = {}) {
  // 输入验证
  if (!title || !content) {
    throw new Error("标题和内容为必填参数");
  }
  
  const { 
    model = DEFAULT_CONFIG.chatModel,
    maxTokens = 800,
    temperature = 0.1, // 低温度以获得更一致的输出
    language = "zh" // 默认中文
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
  
  const url = `${AI_PROXY_URL}/v1/chat/completions`;
  
  // 根据语言选择提示词
  const prompts = {
    zh: `请分析以下提案并返回一个 JSON 对象，包含以下字段：
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
提案内容：${content}`,

    en: `Please analyze the following proposal and return a JSON object with these fields:
{
  "summary": "Concise English summary of the proposal (50-120 words)",
  "category": "tokenomics/governance/technical/marketing/community/general",
  "risk": "low/medium/high", 
  "suggestions": ["specific suggestion 1", "specific suggestion 2", "specific suggestion 3"],
  "confidence": a number between 0.0 and 1.0 indicating analysis confidence
}

Requirements:
1. Return only JSON, no other text
2. Summary should highlight key points and potential impact
3. Risk assessment based on feasibility, community impact, and potential risks
4. Suggestions should be specific and actionable

Proposal Title: ${title}
Proposal Content: ${content}`
  };
  
  const prompt = prompts[language] || prompts.zh;
  
  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature,
        response_format: { type: "json_object" } // 要求返回 JSON 格式
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`LLM 分析请求失败: ${response.status}`, {
        url,
        status: response.status,
        error: errorText,
        titleLength: title.length,
        contentLength: content.length
      });
      
      throw new Error(`LLM 分析服务错误 ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    // 提取回复内容
    const reply = data.choices?.[0]?.message?.content || 
                  data.choices?.[0]?.text || 
                  data.output || 
                  "";
    
    if (!reply) {
      throw new Error("LLM 返回空响应");
    }
    
    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(reply);
      
      // 验证必需字段
      const requiredFields = ["summary", "category", "risk", "suggestions"];
      const missingFields = requiredFields.filter(field => !parsed[field]);
      
      if (missingFields.length > 0) {
        console.warn("LLM 响应缺少必需字段:", missingFields);
        // 提供默认值
        return {
          summary: parsed.summary || `关于"${title}"的提案分析`,
          category: parsed.category || "general",
          risk: parsed.risk || "medium",
          suggestions: parsed.suggestions || ["请进行人工审核"],
          confidence: parsed.confidence || 0.5,
          hasMissingFields: true
        };
      }
      
      return parsed;
      
    } catch (parseError) {
      console.warn("无法解析 LLM JSON 响应，使用回退处理:", parseError.message);
      
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
    console.error("LLM 分析失败:", {
      error: error.message,
      title: title.substring(0, 50),
      contentLength: content.length
    });
    
    // 返回一个基本的分析结果
    return {
      summary: `分析服务暂时不可用。提案标题: ${title.substring(0, 100)}...`,
      category: "general",
      risk: "medium",
      suggestions: ["系统分析服务暂时不可用，请稍后重试或进行人工审核"],
      confidence: 0.0,
      isError: true,
      errorMessage: error.message
    };
  }
}

/**
 * 批量获取嵌入向量（优化性能）
 */
export async function getBatchEmbeddings(texts, model = DEFAULT_CONFIG.embeddingModel) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("文本数组不能为空");
  }
  
  // 简单的串行处理，实际应用中可以考虑并行（注意速率限制）
  const embeddings = [];
  for (const text of texts) {
    try {
      const embedding = await getEmbedding(text, model);
      embeddings.push(embedding);
    } catch (error) {
      console.error(`批量嵌入处理失败，文本: ${text.substring(0, 50)}...`, error);
      // 可以选择跳过失败项或抛出错误
      throw error;
    }
  }
  
  return embeddings;
}

/**
 * 获取可用的模型列表
 */
export async function getAvailableModels() {
  if (!AI_PROXY_URL) {
    return {
      embedding: [DEFAULT_CONFIG.embeddingModel],
      chat: [DEFAULT_CONFIG.chatModel],
      note: "AI_PROXY_URL 未配置，返回默认模型"
    };
  }
  
  try {
    const response = await fetchWithRetry(`${AI_PROXY_URL}/v1/models`, {
      method: "GET",
      headers: getHeaders()
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    
    return {
      embedding: [DEFAULT_CONFIG.embeddingModel],
      chat: [DEFAULT_CONFIG.chatModel],
      error: `获取模型列表失败: ${response.status}`
    };
    
  } catch (error) {
    console.error("获取模型列表失败:", error);
    return {
      embedding: [DEFAULT_CONFIG.embeddingModel],
      chat: [DEFAULT_CONFIG.chatModel],
      error: error.message
    };
  }
}

// 导出配置信息
export const config = {
  isConfigured: !!AI_PROXY_URL,
  url: AI_PROXY_URL,
  hasKey: !!AI_PROXY_KEY,
  defaultModels: {
    embedding: DEFAULT_CONFIG.embeddingModel,
    chat: DEFAULT_CONFIG.chatModel
  }
};