// pages/api/listProposals.js
import { listEntities } from "../../lib/milvus.js";

export default async function handler(req, res) {
  try {
    const offset = Number(req.query.offset || 0);
    const limit = Number(req.query.limit || 50);
    const data = await listEntities("proposals", offset, limit);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("listProposals error", err);
    return res.status(500).json({ error: err.message });
  }
}