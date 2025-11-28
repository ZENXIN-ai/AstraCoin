import fs from "fs";
import path from "path";
import { embedText } from "../../lib/ai_proxy.js";  
import { milvusClient, collectionName } from "../../lib/milvus.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, description, budget } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: "缺少必要字段：标题 或 内容" });
  }

  try {
    // 1️⃣ 生成 embedding（DeepSeek）
    const textToEmbed = `${title}\n${description}`;
    const embedding = await embedText(textToEmbed);

    // 2️⃣ 创建提案对象
    const proposal = {
      id: Date.now().toString(),
      title,
      description,
      budget: budget || 0,
      createdAt: new Date().toISOString(),
    };

    // 3️⃣ 写入本地 JSON 数据库（提案列表）
    const proposalsPath = path.join(process.cwd(), "data", "proposals.json");
    let list = [];

    if (fs.existsSync(proposalsPath)) {
      list = JSON.parse(fs.readFileSync(proposalsPath, "utf8"));
    }

    list.push(proposal);
    fs.writeFileSync(proposalsPath, JSON.stringify(list, null, 2));

    // 4️⃣ 写入 Zilliz（Milvus 向量库）
    await milvusClient.insert({
      collection_name: collectionName,
      data: [
        {
          id: proposal.id,
          vector: embedding
        }
      ]
    });

    return res.status(200).json({
      message: "提案提交成功",
      proposalId: proposal.id
    });

  } catch (err) {
    console.error("Analyze Error:", err);
    return res.status(500).json({ error: "服务器错误：" + err.message });
  }
}