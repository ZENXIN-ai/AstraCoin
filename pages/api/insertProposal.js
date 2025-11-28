import fs from "fs";
import path from "path";
import { milvusClient, collectionName } from "../../../lib/milvus";
import { embedText } from "../../../lib/ai_proxy";

export default async function handler(req, res) {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Missing title or content" });
    }

    // 生成向量 embedding
    const embedding = await embedText(content);

    // 生成提案 ID（递增）
    const dbPath = path.join(process.cwd(), "data", "proposals.json");
    const raw = fs.readFileSync(dbPath, "utf8");
    const proposals = JSON.parse(raw);

    const newId = proposals.length > 0 ? proposals[proposals.length - 1].id + 1 : 1;

    // 写入向量数据库（Milvus）
    await milvusClient.insert({
      collection_name: collectionName,
      data: [
        {
          id: newId,
          vector: embedding,
        },
      ],
    });

    // 写入本地 JSON 数据库
    const newProposal = {
      id: newId,
      title,
      content,
      created_at: new Date().toISOString(),
      votes: 0,
    };

    proposals.push(newProposal);
    fs.writeFileSync(dbPath, JSON.stringify(proposals, null, 2));

    return res.status(200).json({
      message: "Proposal created",
      id: newId,
    });

  } catch (err) {
    console.error("Insert Error:", err);
    return res.status(500).json({ error: "Server error", detail: err.toString() });
  }
}