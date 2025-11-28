import fs from "fs";
import path from "path";
import { embedText } from "../../../lib/ai_proxy.js";
import { milvusClient, collectionName } from "../../../lib/milvus.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, description, budget } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: "缺少标题或内容" });
  }

  try {
    // 1️⃣ 创建向量 embedding
    const text = `${title}\n${description}`;
    const vector = await embedText(text);

    // 2️⃣ 创建提案对象
    const proposal = {
      id: Date.now().toString(),
      title,
      description,
      budget: budget || 0,
      createdAt: new Date().toISOString()
    };

    // 3️⃣ 写入 JSON 数据库
    const filePath = path.join(process.cwd(), "data", "proposals.json");

    let list = [];
    if (fs.existsSync(filePath)) {
      list = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    list.push(proposal);
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));

    // 4️⃣ 写入向量数据库（Zilliz）
    await milvusClient.insert({
      collection_name: collectionName,
      data: [
        {
          id: proposal.id,
          vector
        }
      ]
    });

    return res.status(200).json({
      ok: true,
      message: "提案提交成功",
      proposalId: proposal.id
    });

  } catch (err) {
    console.error("Analyze Error:", err);
    return res.status(500).json({ error: err.message });
  }
}