import { SUPABASE_CONFIG } from "./supabase-config.js";
import { requireAdminAccessToken } from "./supabase-client.js";

const STORE_KEY = "maintenanceHubData_v1";

export function remoteEnabled() {
  return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultData() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    root: {
      id: "root",
      name: "Maintenance Hub",
      images: [],
      children: [
        {
          id: uid(),
          name: "Excavator",
          images: [],
          children: [
            {
              id: uid(),
              name: "Caterpillar",
              images: [],
              children: [
                {
                  id: uid(),
                  name: "336",
                  images: [],
                  children: [
                    { id: uid(), name: "Engine", images: [], children: [] }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: uid(),
          name: "Dozer",
          images: [],
          children: [
            {
              id: uid(),
              name: "Caterpillar",
              images: [],
              children: [
                {
                  id: uid(),
                  name: "D6",
                  images: [],
                  children: [
                    { id: uid(), name: "Engine", images: [], children: [] }
                  ]
                }
              ]
            },
            {
              id: uid(),
              name: "Komatsu",
              images: [],
              children: [
                {
                  id: uid(),
                  name: "D61",
                  images: [],
                  children: [
                    { id: uid(), name: "Engine", images: [], children: [] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function setLocalDataRaw(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

async function apiHeaders({ admin = false, ...extra } = {}) {
  const headers = {
    apikey: SUPABASE_CONFIG.anonKey,
    ...extra
  };

  if (admin) {
    headers.Authorization = `Bearer ${await requireAdminAccessToken()}`;
  }

  return headers;
}

function tableUrl(table, query = "") {
  const base = `${SUPABASE_CONFIG.url}/rest/v1/${table}`;
  return query ? `${base}?${query}` : base;
}

function publicStorageUrl(path) {
  return `${SUPABASE_CONFIG.url}/storage/v1/object/public/${SUPABASE_CONFIG.storageBucket}/${encodeURI(path)}`;
}

function uploadContentType(file) {
  if (file.type && file.type !== "application/octet-stream") return file.type;

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const mimeByExtension = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".ogv": "video/ogg"
  };

  return mimeByExtension[extension] || "application/octet-stream";
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Supabase request failed: ${res.status}${details ? ` - ${details}` : ""}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function flattenTree(root) {
  const categories = [];
  const media = [];

  function visit(node, parentId, sortOrder) {
    if (node.id !== "root") {
      categories.push({
        id: node.id,
        parent_id: parentId === "root" ? null : parentId,
        name: node.name,
        sort_order: sortOrder,
        updated_at: new Date().toISOString()
      });
    }

    (node.images || []).forEach((img, index) => {
      media.push({
        id: img.id || uid(),
        category_id: node.id,
        name: img.name || "media",
        url: img.storagePath ? null : (img.url || img.dataUrl || null),
        storage_path: img.storagePath || null,
        sort_order: index,
        updated_at: new Date().toISOString()
      });
    });

    (node.children || []).forEach((child, index) => visit(child, node.id, index));
  }

  (root.children || []).forEach((child, index) => visit(child, "root", index));
  return { categories, media };
}

function buildTree(categories, media) {
  const root = { id: "root", name: "Maintenance Hub", images: [], children: [] };
  const byId = new Map(categories.map(row => [
    row.id,
    { id: row.id, name: row.name, images: [], children: [] }
  ]));

  for (const item of media || []) {
    const node = byId.get(item.category_id);
    if (!node) continue;
    node.images.push({
      id: item.id,
      name: item.name,
      url: item.url || (item.storage_path ? publicStorageUrl(item.storage_path) : ""),
      storagePath: item.storage_path || ""
    });
  }

  const sortedCategories = [...categories].sort((a, b) => {
    if ((a.parent_id || "") === (b.parent_id || "")) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }
    return (a.parent_id || "").localeCompare(b.parent_id || "");
  });

  for (const row of sortedCategories) {
    const node = byId.get(row.id);
    const parent = row.parent_id ? byId.get(row.parent_id) : root;
    if (parent) parent.children.push(node);
  }

  return { version: 2, updatedAt: new Date().toISOString(), root };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const seed = defaultData();
      localStorage.setItem(STORE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.root) throw new Error("Bad data");
    return parsed;
  } catch {
    const seed = defaultData();
    localStorage.setItem(STORE_KEY, JSON.stringify(seed));
    return seed;
  }
}

export async function saveData(data) {
  data.updatedAt = new Date().toISOString();
  const previousRaw = localStorage.getItem(STORE_KEY);
  const nextRaw = JSON.stringify(data);
  localStorage.setItem(STORE_KEY, nextRaw);

  try {
    await pushRemoteData(data);
  } catch (error) {
    if (previousRaw === null) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, previousRaw);
    throw error;
  }
}

export function resetData() {
  const seed = defaultData();
  localStorage.setItem(STORE_KEY, JSON.stringify(seed));
  return seed;
}

async function fetchRemoteData() {
  if (!remoteEnabled()) return null;

  const categoryQuery = "select=id,parent_id,name,sort_order,updated_at&order=sort_order.asc";
  const mediaQuery = "select=id,category_id,name,url,storage_path,sort_order,updated_at&order=sort_order.asc";
  const [categories, media] = await Promise.all([
    requestJson(tableUrl(SUPABASE_CONFIG.categoriesTable, categoryQuery), {
      headers: await apiHeaders({ Accept: "application/json" })
    }),
    requestJson(tableUrl(SUPABASE_CONFIG.mediaTable, mediaQuery), {
      headers: await apiHeaders({ Accept: "application/json" })
    })
  ]);

  if (!categories?.length) return null;
  return buildTree(categories, media || []);
}

export async function syncFromRemote(onUpdate) {
  if (!remoteEnabled()) return;
  try {
    const remoteData = await fetchRemoteData();
    if (!remoteData) return;

    setLocalDataRaw(remoteData);
    if (typeof onUpdate === "function") onUpdate(remoteData);
  } catch {
    // ignore sync errors
  }
}

export async function pushRemoteData(data) {
  if (!remoteEnabled()) return;
  const { categories, media } = flattenTree(data.root);

  if (categories.length) {
    await requestJson(tableUrl(SUPABASE_CONFIG.categoriesTable, "on_conflict=id"), {
      method: "POST",
      headers: await apiHeaders({
        admin: true,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify(categories)
    });
  }

  if (media.length) {
    await requestJson(tableUrl(SUPABASE_CONFIG.mediaTable, "on_conflict=id"), {
      method: "POST",
      headers: await apiHeaders({
        admin: true,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify(media)
    });
  }

  await deleteRowsNotIn(SUPABASE_CONFIG.mediaTable, media.map(item => item.id));
  await deleteRowsNotIn(SUPABASE_CONFIG.categoriesTable, categories.map(item => item.id));
}

async function deleteRowsNotIn(table, ids) {
  const filter = ids.length
    ? `id=not.in.(${ids.map(id => `"${String(id).replaceAll('"', '\\"')}"`).join(",")})`
    : "id=not.is.null";

  await requestJson(tableUrl(table, filter), {
    method: "DELETE",
    headers: await apiHeaders({ admin: true, Prefer: "return=minimal" })
  });
}

export async function uploadMediaFile(file, categoryId) {
  const id = crypto.randomUUID?.() || uid();
  if (!remoteEnabled()) {
    return {
      id,
      name: file.name,
      dataUrl: await fileToDataUrl(file)
    };
  }

  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "media";
  const path = `${categoryId}/${id}-${safeName}`;
  const url = `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.storageBucket}/${encodeURI(path)}`;

  await requestJson(url, {
    method: "POST",
    headers: await apiHeaders({
      admin: true,
      "Content-Type": uploadContentType(file),
      "x-upsert": "false"
    }),
    body: file
  });

  return {
    id,
    name: file.name,
    url: publicStorageUrl(path),
    storagePath: path
  };
}

export async function removeStorageObject(path) {
  if (!remoteEnabled() || !path) return;
  const url = `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.storageBucket}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: await apiHeaders({
      admin: true,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ prefixes: [path] })
  });

  if (!res.ok) {
    throw new Error(`Supabase storage cleanup failed: ${res.status}`);
  }
}

export function findNode(root, id, path = []) {
  if (!root) return null;
  const nextPath = [...path, root];
  if (root.id === id) return { node: root, path: nextPath };

  for (const child of root.children || []) {
    const found = findNode(child, id, nextPath);
    if (found) return found;
  }
  return null;
}

export function countDescendants(node) {
  let count = 0;
  for (const c of node.children || []) {
    count += 1 + countDescendants(c);
  }
  return count;
}

export function removeNodeById(parent, id) {
  if (!parent?.children) return false;
  const idx = parent.children.findIndex(c => c.id === id);
  if (idx !== -1) {
    parent.children.splice(idx, 1);
    return true;
  }
  for (const c of parent.children) {
    if (removeNodeById(c, id)) return true;
  }
  return false;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
