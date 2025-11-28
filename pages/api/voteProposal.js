// pages/api/voteProposal.js
import { incrementVotes, getEntityById } from "../../lib/milvus.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const { id, vote } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const ent = await getEntityById("proposals", id);
    if (!ent) return res.status(404).json({ error: "proposal not found" });
    const delta = Number(vote) || 1;
    const result = await incrementVotes("proposals", id, delta);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("voteProposal error", err);
    return res.status(500).json({ error: err.message });
  }
}