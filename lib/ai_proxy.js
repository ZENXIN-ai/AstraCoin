// lib/ai_proxy.js - 完全修复版本
import fetch from "node-fetch";

const AI_PROXY_URL = (process.env.AI_PROXY_URL || "").replace(/\/+$/, "");
const AI_PROXY_KEY = process.env.AI_PROXY_KEY || "";

// 默认配置
const DEFAULT_CONFIG = {
  embeddingModel: "text-embedding-3-small",
  chatModel: "gpt-4o-mini",
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

// 修复：使用 Boolean() 而不是 !!
function isAIConfigured() {
  return Boolean(AI_PROXY_URL);
}

function hasAIKey() {
  return Boolean(AI_PROXY_KEY);
}

// ... 中间的函数保持不变 ...

/**
 * 生成文本向量嵌入
 */
export async function get