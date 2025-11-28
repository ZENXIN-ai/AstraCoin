// pages/api/searchSimilar.js
import { searchVectors } from "../../lib/milvus.js";
import { getEmbedding } from "../../lib/ai_proxy.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { text, topK = 5 } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });

    const vector = await getEmbedding(text);
    const search = await searchVectors("proposals", vector, topK);
    return res.json({ ok: true, result: search });
  } catch (err) {
    console.error("searchSimilar error", err);
    return res.status(500).json({ error: err.message });
  }
}