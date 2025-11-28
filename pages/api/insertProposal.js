// pages/api/insertProposal.js
import { createCollectionIfNotExists, insertVectors } from "../../lib/milvus.js";
import { getEmbedding } from "../../lib/ai_proxy.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "title/content required" });

    await createCollectionIfNotExists("proposals", 1536);
    const vector = await getEmbedding(`${title}\n${content}`);
    const nowId = `p_${Date.now()}`;

    const rec = {
      id: nowId,
      title,
      content,
      category: "general",
      risk: "low",
      status: "pending",
      votes: 0,
      vector
    };

    const result = await insertVectors("proposals", [rec]);
    return res.json({ ok: true, id: nowId, result });
  } catch (err) {
    console.error("insertProposal error", err);
    return res.status(500).json({ error: err.message });
  }
}