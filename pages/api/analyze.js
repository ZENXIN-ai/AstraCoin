// pages/api/analyze.js
import { createCollectionIfNotExists, insertVectors, searchVectors } from "../../lib/milvus.js";
import { getEmbedding, analyzeWithLLM } from "../../lib/ai_proxy.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "title/content required" });

    await createCollectionIfNotExists("proposals", 1536);

    // 1. LLM classification & suggestions
    let llmResult = { summary: "", category: "general", risk: "low", suggestions: [] };
    try {
      llmResult = await analyzeWithLLM(title, content);
    } catch (e) {
      console.warn("LLM analysis failed, fallback to keywords", e.message);
      // fallback to keyword heuristics
      const lower = `${title} ${content}`.toLowerCase();
      if (lower.includes("治理") || lower.includes("dao")) llmResult.category = "governance";
      if (lower.includes("代币") || lower.includes("token")) llmResult.category = "tokenomics";
      if (lower.includes("漏洞") || lower.includes("分叉")) llmResult.risk = "high";
      llmResult.summary = (title + " " + content).slice(0, 300);
    }

    // 2. embedding + search
    const vector = await getEmbedding(`${title}\n${content}`);
    const search = await searchVectors("proposals", vector, 5);

    // 3. insert this proposal (with category/risk from llm)
    const id = `p_${Date.now()}`;
    await insertVectors("proposals", [{
      id,
      title,
      content,
      category: llmResult.category || "general",
      risk: llmResult.risk || "low",
      status: "pending",
      votes: 0,
      vector
    }]);

    return res.json({
      ok: true,
      id,
      ai: llmResult,
      search
    });

  } catch (err) {
    console.error("analyze error", err);
    return res.status(500).json({ error: err.message });
  }
}