// pages/api/getProposal.js
import { getEntityById } from "../../lib/milvus.js";

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "id required" });
    const data = await getEntityById("proposals", id);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("getProposal error", err);
    return res.status(500).json({ error: err.message });
  }
}