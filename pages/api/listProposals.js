import { milvusClient, collectionName } from "../../../lib/milvus";

export default async function handler(req, res) {
  try {
    // 从 Milvus 查询所有 id
    const results = await milvusClient.query({
      collection_name: collectionName,
      expr: "id >= 0", // 取全部数据
      output_fields: ["id"],
    });

    // 排序，保证顺序从旧到新
    const ids = results.data
      .map(item => item.id)
      .sort((a, b) => Number(a) - Number(b));

    // 这里你还没有真正存储 title / content，
    // 暂时给一个占位内容（之后我们会做真正的存储机制）
    const list = ids.map(id => ({
      id,
      title: `提案 #${id}`,
      content: "这里是占位内容，之后会替换为真实数据库内容。",
    }));

    return res.status(200).json(list);

  } catch (err) {
    console.error("LIST ERROR:", err);
    return res.status(500).json({ error: "Server error", detail: err });
  }
}
