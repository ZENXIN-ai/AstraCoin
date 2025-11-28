// scripts/initData.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const proposalsData = [
  {
    "id": 1,
    "title": "关于改进社区治理机制的提案",
    "content": "我们建议引入新的投票机制，包括二次投票和委托投票功能，以提高社区决策的效率和参与度。",
    "description": "改进社区治理机制，引入二次投票和委托投票",
    "summary": "提案旨在通过引入二次投票和委托投票机制来提升社区治理效率...",
    "budget": 5000,
    "status": "pending",
    "category": "governance",
    "risk": "medium",
    "votes": 15,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-20T14:25:00.000Z",
    "created_by": "0x742d35Cc6634C0532925a3b8D4B5A3B8D5B3B8D5",
    "voters": [],
    "tags": ["治理", "投票", "社区"]
  }
];

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ 创建 data 目录');
}

const filePath = path.join(dataDir, 'proposals.json');
fs.writeFileSync(filePath, JSON.stringify(proposalsData, null, 2));

console.log('✅ proposals.json 文件初始化成功！');
console.log(`📁 文件路径: ${filePath}`);
console.log(`📊 包含 ${proposalsData.length} 个示例提案`);
