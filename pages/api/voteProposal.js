// pages/api/voteProposal.js
import { incrementVotes, getEntityById } from "../../lib/milvus.js";
import fs from "fs";
import path from "path";

// 本地提案文件路径
const proposalsFilePath = path.join(process.cwd(), "data", "proposals.json");

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== "POST") {
    return res.status(405).json({ 
      success: false,
      error: "方法不允许",
      details: "只支持 POST 请求",
      code: "METHOD_NOT_ALLOWED"
    });
  }

  try {
    const { id, vote = 1, voter } = req.body;

    // 输入验证
    if (!id) {
      return res.status(400).json({ 
        success: false,
        error: "缺少必要参数",
        details: "提案 ID 为必填参数",
        code: "MISSING_PROPOSAL_ID"
      });
    }

    // 验证投票值
    const voteValue = Number(vote);
    if (isNaN(voteValue) || (voteValue !== 1 && voteValue !== -1)) {
      return res.status(400).json({ 
        success: false,
        error: "投票值无效",
        details: "投票值必须为 1 (赞成) 或 -1 (反对)",
        code: "INVALID_VOTE_VALUE"
      });
    }

    // 1️⃣ 首先检查提案是否存在
    let proposalExists = false;
    
    // 先检查本地文件
    if (fs.existsSync(proposalsFilePath)) {
      try {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        const proposals = JSON.parse(fileContent);
        const proposal = proposals.find(p => p.id == id);
        proposalExists = !!proposal;
      } catch (fileError) {
        console.warn("读取本地提案文件失败:", fileError);
      }
    }

    // 如果本地文件没找到，检查向量数据库
    if (!proposalExists) {
      try {
        const entity = await getEntityById("proposals", id);
        proposalExists = !!(entity && entity.data && entity.data.length > 0);
      } catch (milvusError) {
        console.error("检查提案存在性失败:", milvusError);
      }
    }

    if (!proposalExists) {
      return res.status(404).json({ 
        success: false,
        error: "提案未找到",
        details: `未找到 ID 为 ${id} 的提案`,
        code: "PROPOSAL_NOT_FOUND"
      });
    }

    // 2️⃣ 更新向量数据库中的投票数
    let milvusResult;
    try {
      milvusResult = await incrementVotes("proposals", id, voteValue);
    } catch (milvusError) {
      console.error("更新向量数据库投票数失败:", milvusError);
      // 继续处理，尝试更新本地文件
    }

    // 3️⃣ 更新本地 JSON 文件中的投票数
    let localResult = null;
    if (fs.existsSync(proposalsFilePath)) {
      try {
        const fileContent = fs.readFileSync(proposalsFilePath, "utf8");
        const proposals = JSON.parse(fileContent);
        
        const proposalIndex = proposals.findIndex(p => p.id == id);
        if (proposalIndex !== -1) {
          // 更新投票数
          if (!proposals[proposalIndex].votes) {
            proposals[proposalIndex].votes = 0;
          }
          proposals[proposalIndex].votes += voteValue;
          
          // 更新修改时间
          proposals[proposalIndex].updatedAt = new Date().toISOString();
          
          // 记录投票者（如果提供）
          if (voter) {
            if (!proposals[proposalIndex].voters) {
              proposals[proposalIndex].voters = [];
            }
            // 简单的投票者记录，实际应用中可能需要更复杂的去重逻辑
            proposals[proposalIndex].voters.push({
              voter: voter,
              vote: voteValue,
              timestamp: new Date().toISOString()
            });
          }
          
          localResult = proposals[proposalIndex];
          
          // 写回文件
          const tempPath = proposalsFilePath + '.tmp';
          fs.writeFileSync(tempPath, JSON.stringify(proposals, null, 2));
          fs.renameSync(tempPath, proposalsFilePath);
        }
      } catch (fileError) {
        console.error("更新本地文件投票数失败:", fileError);
      }
    }

    // 4️⃣ 返回成功响应
    const responseData = {
      success: true,
      message: voteValue > 0 ? "投票成功" : "反对投票成功",
      data: {
        proposalId: id,
        vote: voteValue,
        newVoteCount: localResult ? localResult.votes : undefined,
        voter: voter || undefined
      }
    };

    // 如果向量数据库更新成功，也包含其结果
    if (milvusResult) {
      responseData.data.milvusResult = milvusResult;
    }

    return res.status(200).json(responseData);

  } catch (err) {
    console.error("投票操作错误:", err);
    
    // 错误响应
    const errorResponse = {
      success: false,
      error: "投票失败",
      code: "VOTE_PROPOSAL_ERROR"
    };

    // 开发环境下返回详细错误
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.message;
      errorResponse.stack = err.stack;
    }

    return res.status(500).json(errorResponse);
  }
}