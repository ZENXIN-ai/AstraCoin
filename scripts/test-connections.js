// scripts/test-connections.js
import { getEmbedding, analyzeWithLLM } from '../lib/ai_proxy.js';
import { healthCheck, createCollectionIfNotExists } from '../lib/milvus.js';

async function testConnections() {
  console.log('🔍 开始连接测试...\n');
  
  try {
    // 测试 DeepSeek 连接
    console.log('1. 测试 DeepSeek API 连接...');
    try {
      const testVector = await getEmbedding('测试连接');
      console.log('   ✅ DeepSeek 嵌入API: 连接成功');
      console.log(`     向量维度: ${testVector.length}`);
    } catch (error) {
      console.log('   ❌ DeepSeek 嵌入API: 连接失败 -', error.message);
    }
    
    // 测试 DeepSeek 聊天API
    console.log('\n2. 测试 DeepSeek 聊天API...');
    try {
      const analysis = await analyzeWithLLM('测试提案', '这是一个测试提案内容');
      console.log('   ✅ DeepSeek 聊天API: 连接成功');
      console.log(`     分析摘要: ${analysis.summary.substring(0, 50)}...`);
    } catch (error) {
      console.log('   ❌ DeepSeek 聊天API: 连接失败 -', error.message);
    }
    
    // 测试 Zilliz 连接
    console.log('\n3. 测试 Zilliz 连接...');
    try {
      const milvusHealth = await healthCheck();
      console.log('   ✅ Zilliz: 连接成功');
      console.log(`     状态: ${milvusHealth.status}`);
      console.log(`     配置: ${milvusHealth.configured ? '已配置' : '未配置'}`);
      
      // 测试集合创建
      console.log('\n4. 测试集合创建...');
      try {
        const collectionResult = await createCollectionIfNotExists();
        console.log('   ✅ 集合检查: 成功');
        if (collectionResult.exists) {
          console.log('     集合已存在');
        } else {
          console.log('     集合创建成功');
        }
      } catch (error) {
        console.log('   ❌ 集合操作失败 -', error.message);
      }
      
    } catch (error) {
      console.log('   ❌ Zilliz: 连接失败 -', error.message);
    }
    
  } catch (error) {
    console.log('❌ 连接测试失败:', error.message);
  }
  
  console.log('\n✨ 连接测试完成');
}

testConnections();