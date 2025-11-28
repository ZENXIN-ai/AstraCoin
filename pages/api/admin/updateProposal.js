// pages/api/admin/updateProposal.js
import { updateEntityById, getEntityById } from "../../../lib/milvus.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const adminSecret = process.env.ADMIN_SECRET;
    const provided = req.headers['x-admin-secret'] || req.body.admin_secret;
    if (!adminSecret || provided !== adminSecret) return res.status(403).json({ error: "forbidden" });

    const { id, fields } = req.body;
    if (!id || !fields) return res.status(400).json({ error: "id and fields required" });

    const existing = await getEntityById("proposals", id);
    if (!existing) return res.status(404).json({ error: "proposal not found" });

    const resp = await updateEntityById("proposals", id, fields);
    return res.json({ ok: true, resp });
  } catch (err) {
    console.error("admin.updateProposal error", err);
    return res.status(500).json({ error: err.message });
  }
}