// lib/ai_proxy.js
import fetch from "node-fetch";

const AI_PROXY_URL = (process.env.AI_PROXY_URL || "").replace(/\/+$/, "");
const AI_PROXY_KEY = process.env.AI_PROXY_KEY || "";

function headers() {
  const h = { "Content-Type": "application/json" };
  if (AI_PROXY_KEY) h["Authorization"] = `Bearer ${AI_PROXY_KEY}`;
  return h;
}

/**
 * generate embeddings using proxy
 * returns array of numbers
 */
export async function getEmbedding(text, model = "text-embedding-3-small") {
  if (!AI_PROXY_URL) throw new Error("AI_PROXY_URL 未配置");
  const url = `${AI_PROXY_URL}/v1/embeddings`;
  const resp = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ input: text, model })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Embedding error ${resp.status}: ${txt}`);
  }
  const j = await resp.json();
  const emb = (j.data && j.data[0] && j.data[0].embedding) || (j.embeddings && j.embeddings[0] && j.embeddings[0].embedding);
  if (!emb) throw new Error("无法解析 embedding 响应: " + JSON.stringify(j));
  return emb;
}

/**
 * chat analysis - ask the proxy to analyze title+content and return JSON
 * tries to parse JSON from the assistant reply, if fails returns raw text as summary
 */
export async function analyzeWithLLM(title, content) {
  if (!AI_PROXY_URL) return { summary: "AI 未配置，返回模拟摘要。", category: "general", risk: "low", suggestions: [] };
  const url = `${AI_PROXY_URL}/v1/chat/completions`;
  const prompt = `请用中文返回一个 JSON，包含字段：
{
  "summary": "对提案的简短中文摘要（50-120字）",
  "category": "代币/治理/技术/市场/综合（tokenomics/governance/technical/marketing/general）",
  "risk": "low/medium/high",
  "suggestions": ["可操作建议1","建议2"]
}
不要输出其它文本。 现在的提案如下：
标题：${title}
内容：${content}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`LLM analyze failed ${resp.status}: ${txt}`);
  }
  const j = await resp.json();
  const reply = (j.choices && j.choices[0] && (j.choices[0].message?.content || j.choices[0].text)) || j.output || "";
  // try parse json
  try {
    const parsed = JSON.parse(reply);
    return parsed;
  } catch (e) {
    // fallback: return reply as summary
    return { summary: reply, category: "general", risk: "low", suggestions: [] };
  }
}