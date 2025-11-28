// lib/milvus.js
import fetch from "node-fetch";

const BASE = (process.env.ZILLIZ_API_URL || "").replace(/\/+$/, "");
const KEY  = process.env.ZILLIZ_API_KEY || "";

function headers() {
  const h = { "Content-Type": "application/json" };
  if (KEY) h["Authorization"] = `Bearer ${KEY}`;
  return h;
}

async function safeFetch(path, opts = {}) {
  if (!BASE) throw new Error("ZILLIZ_API_URL 未配置");
  const url = `${BASE}${path}`;
  const resp = await fetch(url, { headers: { ...(opts.headers || {}), ...headers() }, ...opts });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = text; }
  if (!resp.ok) {
    const err = new Error(`ZILLIZ ${resp.status} ${resp.statusText}: ${text}`);
    err.status = resp.status;
    err.raw = text;
    throw err;
  }
  return json;
}

export async function createCollectionIfNotExists(collection = "proposals", dim = 1536) {
  try {
    const check = await safeFetch(`/v2/collections/${collection}`, { method: "GET" });
    if (check) return true;
  } catch (e) {
    // not found -> create
  }

  const createUrl = `/v2/collections`;
  const body = {
    collectionName: collection,
    dimension: dim,
    primaryField: "id",
    fields: [
      { name: "id", dataType: "VarChar", maxLength: 128, isPrimary: true },
      { name: "title", dataType: "VarChar", maxLength: 1024 },
      { name: "content", dataType: "VarChar", maxLength: 65535 },
      { name: "category", dataType: "VarChar", maxLength: 128 },
      { name: "risk", dataType: "VarChar", maxLength: 32 },
      { name: "status", dataType: "VarChar", maxLength: 32 },
      { name: "votes", dataType: "Int64" },
      { name: "vector", dataType: "FloatVector", dimension: dim }
    ]
  };

  const resp = await safeFetch(createUrl, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return resp;
}

export async function insertVectors(collection = "proposals", records = []) {
  const url = `/v2/vectors`;
  const payload = { collectionName: collection, data: records };
  const resp = await safeFetch(url, { method: "POST", body: JSON.stringify(payload) });
  return resp;
}

export async function searchVectors(collection = "proposals", vector = [], topK = 5) {
  const url = `/v2/vectors/search`;
  const payload = {
    collectionName: collection,
    vector,
    topK,
    metricType: "COSINE",
    outputFields: ["id", "title", "content", "category", "risk", "status", "votes"]
  };
  const resp = await safeFetch(url, { method: "POST", body: JSON.stringify(payload) });
  return resp;
}

export async function listEntities(collection = "proposals", offset = 0, limit = 50) {
  const url = `/v2/collections/${collection}/entities?offset=${offset}&limit=${limit}`;
  const resp = await safeFetch(url, { method: "GET" });
  return resp;
}

export async function getEntityById(collection = "proposals", id) {
  try {
    const url = `/v2/collections/${collection}/entities/${encodeURIComponent(id)}`;
    const resp = await safeFetch(url, { method: "GET" });
    return resp;
  } catch (e) {
    // fallback: list and find
    const all = await listEntities(collection, 0, 1000);
    const entities = all?.entities || all?.data || all?.rows || [];
    return entities.find(it => it.id === id) || null;
  }
}

export async function updateEntityById(collection = "proposals", id, fieldsObj = {}) {
  const record = { id };
  const allowed = ["title", "content", "category", "risk", "status", "votes", "vector"];
  for (const k of Object.keys(fieldsObj)) {
    if (allowed.includes(k)) record[k] = fieldsObj[k];
  }
  const resp = await insertVectors(collection, [record]);
  return resp;
}

export async function deleteEntityById(collection = "proposals", id) {
  const url = `/v2/collections/${collection}/entities`;
  const payload = { ids: [id] };
  const resp = await safeFetch(url, { method: "DELETE", body: JSON.stringify(payload) });
  return resp;
}

export async function incrementVotes(collection = "proposals", id, delta = 1) {
  const ent = await getEntityById(collection, id);
  let current = 0;
  if (ent && ent.votes !== undefined && ent.votes !== null) current = Number(ent.votes) || 0;
  const newVotes = current + Number(delta);
  const resp = await updateEntityById(collection, id, { votes: newVotes });
  return { previous: current, now: newVotes, resp };
}

export default {
  createCollectionIfNotExists,
  insertVectors,
  searchVectors,
  listEntities,
  getEntityById,
  updateEntityById,
  deleteEntityById,
  incrementVotes
};