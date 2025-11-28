import { milvusClient, collectionName } from "../../../lib/milvus";

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    // 使用表达式查询获取该提案向量记录
    const search = await milvusClient.query({
      collection_name: collectionName,
      expr: `id == ${id}`,
      output_fields: ["id", "vector"],   // 决定返回哪些内容
    });

    if (!search.data.length) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    // Milvus 只存向量，这里你可以加入你的自定义存储（如 KV、JSON 文件等）
    // 暂时用占位符：
    const mock = {
      id,
      title: `提案 #${id}`,
      content: "这里是你提案的详细内容（占位）",
      created_at: new Date().toISOString(),
    };

    return res.status(200).json(mock);

  } catch (err) {
    console.error("GET ERROR:", err);
    return res.status(500).json({ error: "Server error", detail: err });
  }
}
