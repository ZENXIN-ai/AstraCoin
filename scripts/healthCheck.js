// scripts/healthCheck.js
import { healthCheck } from '../lib/milvus.js';
import fs from 'fs';
import path from 'path';

console.log('🔍 开始系统健康检查...\n');

// 检查环境变量
console.log('📋 环境变量检查:');
console.log(`   - ZILLIZ_API_URL: ${process.env.ZILLIZ_API_URL ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`   - ZILLIZ_API_KEY: ${process.env.ZILLIZ_API_KEY ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`   - AI_PROXY_URL: ${process.env.AI_PROXY_URL ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`   - AI_PROXY_KEY: ${process.env.AI_PROXY_KEY ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`   - ADMIN_SECRET: ${process.env.ADMIN_SECRET ? '✅ 已设置' : '❌ 未设置'}`);

// 检查数据目录
const dataDir = path.join(process.cwd(), 'data');
const proposalsFile = path.join(dataDir, 'proposals.json');
console.log('\n📁 文件系统检查:');
console.log(`   - data 目录: ${fs.existsSync(dataDir) ? '✅ 存在' : '❌ 不存在'}`);
console.log(`   - proposals.json: ${fs.existsSync(proposalsFile) ? '✅ 存在' : '❌ 不存在'}`);

// Milvus 健康检查
console.log('\n🗄️  Milvus 健康检查:');
try {
  const milvusHealth = await healthCheck();
  console.log(`   - 连接状态: ${milvusHealth.status === 'healthy' ? '✅ 健康' : '❌ 异常'}`);
  console.log(`   - 配置状态: ${milvusHealth.configured ? '✅ 已配置' : '❌ 未配置'}`);
} catch (error) {
  console.log(`   - 连接状态: ❌ 错误 - ${error.message}`);
}

console.log('\n✨ 健康检查完成！');
