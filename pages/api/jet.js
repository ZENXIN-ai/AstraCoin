import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    const filePath = path.join(process.cwd(), "data", "proposals.json");
    const list = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const item = list.find(p => Number(p.id) === Number(id));

    if (!item) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    return res.status(200).json({
      ok: true,
      proposal: item
    });

  } catch (err) {
    console.error("GET ERROR:", err);
    return res.status(500).json({ error: "Server error", detail: err.toString() });
  }
}
