import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "proposals.json");

    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ error: "proposals.json not found" });
    }

    const list = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // 可以按时间排序（最新在最前）
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 列表页不需要全文 → 返回摘要
    const formatted = list.map(p => ({
      id: p.id,
      title: p.title,
      summary: p.content.slice(0, 100) + (p.content.length > 100 ? "..." : ""),
      created_at: p.created_at,
      votes: p.votes || 0
    }));

    return res.status(200).json(formatted);

  } catch (err) {
    console.error("LIST ERROR:", err);
    return res.status(500).json({ error: "Server error", detail: err.toString() });
  }
}
