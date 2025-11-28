// lib/milvus.js
import fetch from "node-fetch";

const BASE = (process.env.ZILLIZ_API_URL || "").replace(/\/+$/, "");
const KEY = process.env.ZILLIZ_API_KEY || "";

// 默认配置
const DEFAULT_CONFIG = {
  collectionName: "proposals",
  vectorDimension: 1536,
  timeout: 30000, // 30秒超时
  maxRetries: 2,  // 最大重试次数
  retryDelay: 1000 // 重试延迟
};

// 允许更新的字段白名单
const ALLOWED_UPDATE_FIELDS = [
  "title", "content", "category", "risk", "status", 
  "votes", "vector", "updated_at", "description", "budget"
];

function getHeaders() {
  const headers = { 
    "Content-Type": "application/json",
    "User-Agent": "AstraCoin-DApp/1.0.0"
  };
  
  if (KEY) {
    headers["Authorization"] = `Bearer ${KEY}`;
  }
  
  return headers;
}

/**
 * 带重试和错误处理的 fetch 包装器
 */
async function safeFetch(path, opts = {}) {
  if (!BASE) {
    throw new Error("ZILLIZ_API_URL 环境变量未配置");
  }
  
  const url = `${BASE}${path}`;
  let lastError = null;
  
  for (let attempt = 0; attempt <= DEFAULT_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_CONFIG.timeout);
      
      const response = await fetch(url, {
        ...opts,
        headers: { ...getHeaders(), ...(opts.headers || {}) },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const text = await response.text();
      let json = null;
      
      try { 
        json = text ? JSON.parse(text) : null; 
      } catch (e) { 
        json = text; 
      }
      
      if (!response.ok) {
        const error = new Error(`Zilliz API 错误 ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.response = json || text;
        error.url = url;
        
        // 如果是服务器错误，进行重试
        if (response.status >= 500 && attempt < DEFAULT_CONFIG.maxRetries) {
          console.warn(`Zilliz API 请求失败，进行重试 (${attempt + 1}/${DEFAULT_CONFIG.maxRetries}):`, error.message);
          await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay));
          lastError = error;
          continue;
        }
        
        throw error;
      }
      
      return json;
      
    } catch (error) {
      if (error.name === 'AbortError' && attempt < DEFAULT_CONFIG.maxRetries) {
        console.warn(`Zilliz API 请求超时，进行重试 (${attempt + 1}/${DEFAULT_CONFIG.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay));
        lastError = error;
        continue;
      }
      
      // 如果是网络错误，包装后抛出
      if (error.name === 'AbortError' || error.code === 'ECONNREFUSED') {
        throw new Error(`Zilliz 服务连接失败: ${error.message}`);
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * 检查集合是否存在
 */
export async function checkCollectionExists(collection = DEFAULT_CONFIG.collectionName) {
  try {
    await safeFetch(`/v2/collections/${collection}`, { method: "GET" });
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * 创建集合（如果不存在）
 */
export async function createCollectionIfNotExists(
  collection = DEFAULT_CONFIG.collectionName, 
  dim = DEFAULT_CONFIG.vectorDimension
) {
  try {
    const exists = await checkCollectionExists(collection);
    if (exists) {
      console.log(`集合 "${collection}" 已存在`);
      return { exists: true, message: "集合已存在" };
    }
  } catch (error) {
    // 检查过程中出现非404错误，重新抛出
    if (error.status !== 404) {
      throw error;
    }
  }

  const createUrl = `/v2/collections`;
  const body = {
    collectionName: collection,
    dimension: dim,
    primaryField: "id",
    idType: "VarChar",
    autoID: false,
    fields: [
      { name: "id", dataType: "VarChar", maxLength: 128, isPrimary: true },
      { name: "title", dataType: "VarChar", maxLength: 1024 },
      { name: "content", dataType: "VarChar", maxLength: 65535 },
      { name: "description", dataType: "VarChar", maxLength: 65535 },
      { name: "category", dataType: "VarChar", maxLength: 128 },
      { name: "risk", dataType: "VarChar", maxLength: 32 },
      { name: "status", dataType: "VarChar", maxLength: 32, defaultValue: "pending" },
      { name: "votes", dataType: "Int64", defaultValue: 0 },
      { name: "budget", dataType: "Int64", defaultValue: 0 },
      { name: "created_at", dataType: "Int64" },
      { name: "updated_at", dataType: "Int64" },
      { name: "vector", dataType: "FloatVector", dimension: dim }
    ]
  };

  try {
    const resp = await safeFetch(createUrl, {
      method: "POST",
      body: JSON.stringify(body)
    });
    
    console.log(`集合 "${collection}" 创建成功`);
    return { success: true, response: resp };
    
  } catch (error) {
    console.error(`创建集合 "${collection}" 失败:`, error.message);
    throw error;
  }
}

/**
 * 插入向量数据
 */
export async function insertVectors(collection = DEFAULT_CONFIG.collectionName, records = []) {
  // 输入验证
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("插入记录不能为空数组");
  }

  // 验证每条记录
  records.forEach((record, index) => {
    if (!record.id) {
      throw new Error(`记录 ${index} 缺少 id 字段`);
    }
    if (!record.vector || !Array.isArray(record.vector)) {
      throw new Error(`记录 ${index} 缺少有效的 vector 字段`);
    }
    if (record.vector.length !== DEFAULT_CONFIG.vectorDimension) {
      console.warn(`记录 ${index} 的向量维度为 ${record.vector.length}, 期望 ${DEFAULT_CONFIG.vectorDimension}`);
    }
  });

  const url = `/v2/vectors`;
  const payload = { 
    collectionName: collection, 
    data: records 
  };
  
  try {
    const resp = await safeFetch(url, { 
      method: "POST", 
      body: JSON.stringify(payload) 
    });
    
    console.log(`成功插入 ${records.length} 条记录到集合 "${collection}"`);
    return resp;
    
  } catch (error) {
    console.error(`插入记录到集合 "${collection}" 失败:`, error.message);
    throw error;
  }
}

/**
 * 搜索相似向量
 */
export async function searchVectors(
  collection = DEFAULT_CONFIG.collectionName, 
  vector = [], 
  topK = 5,
  options = {}
) {
  // 输入验证
  if (!vector || !Array.isArray(vector)) {
    throw new Error("搜索向量必须是非空数组");
  }
  
  if (vector.length !== DEFAULT_CONFIG.vectorDimension) {
    console.warn(`搜索向量维度为 ${vector.length}, 期望 ${DEFAULT_CONFIG.vectorDimension}`);
  }

  const topKNum = Math.min(Math.max(1, parseInt(topK)), 100); // 限制在 1-100 之间

  const url = `/v2/vectors/search`;
  const payload = {
    collectionName: collection,
    vector,
    topK: topKNum,
    metricType: "COSINE",
    outputFields: [
      "id", "title", "content", "description", "category", 
      "risk", "status", "votes", "budget", "created_at"
    ],
    ...options
  };
  
  try {
    const resp = await safeFetch(url, { 
      method: "POST", 
      body: JSON.stringify(payload) 
    });
    
    // 格式化搜索结果
    const results = (resp.data || resp.results || []).map(item => ({
      id: item.id,
      score: item.score || item.distance,
      distance: item.distance || item.score,
      entity: item.entity || item
    }));
    
    console.log(`在集合 "${collection}" 中搜索到 ${results.length} 个相似结果`);
    return results;
    
  } catch (error) {
    console.error(`在集合 "${collection}" 中搜索向量失败:`, error.message);
    throw error;
  }
}

/**
 * 列出实体（带分页）
 */
export async function listEntities(
  collection = DEFAULT_CONFIG.collectionName, 
  offset = 0, 
  limit = 50,
  options = {}
) {
  const offsetNum = Math.max(0, parseInt(offset));
  const limitNum = Math.min(Math.max(1, parseInt(limit)), 1000); // 限制最大1000条
  
  const url = `/v2/collections/${collection}/entities?offset=${offsetNum}&limit=${limitNum}`;
  
  try {
    const resp = await safeFetch(url, { method: "GET" });
    
    const entities = resp.entities || resp.data || resp.rows || [];
    console.log(`从集合 "${collection}" 获取 ${entities.length} 个实体`);
    
    return {
      entities,
      total: resp.total || entities.length,
      offset: offsetNum,
      limit: limitNum,
      hasMore: entities.length === limitNum
    };
    
  } catch (error) {
    console.error(`获取集合 "${collection}" 实体列表失败:`, error.message);
    throw error;
  }
}

/**
 * 根据ID获取实体
 */
export async function getEntityById(collection = DEFAULT_CONFIG.collectionName, id) {
  // 输入验证
  if (!id) {
    throw new Error("实体 ID 不能为空");
  }

  // 首先尝试直接获取
  try {
    const url = `/v2/collections/${collection}/entities/${encodeURIComponent(id)}`;
    const resp = await safeFetch(url, { method: "GET" });
    
    if (resp && (resp.entity || resp.data)) {
      return resp.entity || resp.data;
    }
    
  } catch (error) {
    // 如果是404错误，尝试使用查询方式
    if (error.status === 404) {
      console.log(`实体 ${id} 未找到，尝试查询方式获取`);
    } else {
      // 其他错误直接抛出
      throw error;
    }
  }

  // 回退方案：使用搜索查询
  try {
    const searchUrl = `/v2/vectors/search`;
    const payload = {
      collectionName: collection,
      vector: new Array(DEFAULT_CONFIG.vectorDimension).fill(0), // 使用零向量
      topK: 1,
      expr: `id == "${id}"`,
      outputFields: ["*"]
    };
    
    const resp = await safeFetch(searchUrl, { 
      method: "POST", 
      body: JSON.stringify(payload) 
    });
    
    const results = resp.data || resp.results || [];
    if (results.length > 0) {
      return results[0].entity || results[0];
    }
    
    return null;
    
  } catch (searchError) {
    console.error(`通过查询获取实体 ${id} 失败:`, searchError.message);
    return null;
  }
}

/**
 * 更新实体
 */
export async function updateEntityById(
  collection = DEFAULT_CONFIG.collectionName, 
  id, 
  fieldsObj = {}
) {
  // 输入验证
  if (!id) {
    throw new Error("实体 ID 不能为空");
  }
  
  if (!fieldsObj || typeof fieldsObj !== 'object' || Object.keys(fieldsObj).length === 0) {
    throw new Error("更新字段不能为空");
  }

  // 过滤允许更新的字段
  const updateData = { id };
  let hasValidFields = false;
  
  for (const [key, value] of Object.entries(fieldsObj)) {
    if (ALLOWED_UPDATE_FIELDS.includes(key)) {
      updateData[key] = value;
      hasValidFields = true;
    } else {
      console.warn(`字段 "${key}" 不允许更新，已跳过`);
    }
  }
  
  if (!hasValidFields) {
    throw new Error("没有有效的字段可更新");
  }
  
  // 添加更新时间戳
  updateData.updated_at = Math.floor(Date.now() / 1000);
  
  // 使用插入/更新操作
  try {
    const resp = await insertVectors(collection, [updateData]);
    console.log(`实体 ${id} 更新成功`);
    return resp;
    
  } catch (error) {
    console.error(`更新实体 ${id} 失败:`, error.message);
    throw error;
  }
}

/**
 * 删除实体
 */
export async function deleteEntityById(collection = DEFAULT_CONFIG.collectionName, id) {
  // 输入验证
  if (!id) {
    throw new Error("实体 ID 不能为空");
  }

  const url = `/v2/collections/${collection}/entities`;
  const payload = { ids: [id] };
  
  try {
    const resp = await safeFetch(url, { 
      method: "DELETE", 
      body: JSON.stringify(payload) 
    });
    
    console.log(`实体 ${id} 删除成功`);
    return {
      success: true,
      deletedCount: resp.delete_count || 1,
      id: id
    };
    
  } catch (error) {
    console.error(`删除实体 ${id} 失败:`, error.message);
    throw error;
  }
}

/**
 * 增加投票数
 */
export async function incrementVotes(
  collection = DEFAULT_CONFIG.collectionName, 
  id, 
  delta = 1
) {
  // 输入验证
  if (!id) {
    throw new Error("实体 ID 不能为空");
  }
  
  const deltaNum = Number(delta);
  if (isNaN(deltaNum)) {
    throw new Error("投票增量必须是数字");
  }

  // 获取当前实体
  const entity = await getEntityById(collection, id);
  if (!entity) {
    throw new Error(`实体 ${id} 不存在`);
  }
  
  // 计算新票数
  let currentVotes = 0;
  if (entity.votes !== undefined && entity.votes !== null) {
    currentVotes = Number(entity.votes) || 0;
  }
  
  const newVotes = currentVotes + deltaNum;
  
  // 更新票数
  const resp = await updateEntityById(collection, id, { votes: newVotes });
  
  return {
    previous: currentVotes,
    now: newVotes,
    delta: deltaNum,
    response: resp
  };
}

/**
 * 获取集合统计信息
 */
export async function getCollectionStats(collection = DEFAULT_CONFIG.collectionName) {
  try {
    const url = `/v2/collections/${collection}/stats`;
    const resp = await safeFetch(url, { method: "GET" });
    return resp;
  } catch (error) {
    console.error(`获取集合 "${collection}" 统计信息失败:`, error.message);
    throw error;
  }
}

/**
 * 健康检查
 */
export async function healthCheck() {
  try {
    const url = `/v2/collections`;
    await safeFetch(url, { method: "GET" });
    return { 
      status: "healthy", 
      configured: !!BASE,
      hasKey: !!KEY 
    };
  } catch (error) {
    return { 
      status: "unhealthy", 
      error: error.message,
      configured: !!BASE,
      hasKey: !!KEY 
    };
  }
}

// 导出默认配置
export const collectionName = DEFAULT_CONFIG.collectionName;

// 默认导出所有函数
export default {
  checkCollectionExists,
  createCollectionIfNotExists,
  insertVectors,
  searchVectors,
  listEntities,
  getEntityById,
  updateEntityById,
  deleteEntityById,
  incrementVotes,
  getCollectionStats,
  healthCheck,
  collectionName
};