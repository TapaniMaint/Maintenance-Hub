import { SUPABASE_CONFIG } from "./supabase-config.js";
import { getAccessToken, requireAdminAccessToken, supabase } from "./supabase-client.js";

const STORE_KEY = "maintenanceHubData_v1";
const SIGNED_MEDIA_URL_TTL_SECONDS = 60 * 60;
export const DEFAULT_DEPARTMENT_ID = "mechanics";
export const LANDING_SNAPSHOT_ITEMS = [
  {
    id: "fuel-pumped-ytd",
    label: "Fuel pumped YTD",
    value: "482,300 gal",
    note: "Diesel, DEF, and lube tracking"
  },
  {
    id: "pm-services-complete",
    label: "PM services complete",
    value: "1,248",
    note: "Year to date"
  },
  {
    id: "open-down-units",
    label: "Open down units",
    value: "17",
    note: "Awaiting repair or parts"
  },
  {
    id: "work-orders-closed",
    label: "Work orders closed",
    value: "3,914",
    note: "Shop and field combined"
  }
];

export function remoteEnabled() {
  return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultData() {
  return ensureDepartments({
    version: 2,
    updatedAt: new Date().toISOString(),
    root: {
      id: "root",
      name: "Maintenance Hub",
      images: [],
      children: [
        {
          id: "excavator",
          name: "Excavator",
          images: [],
          children: [
            {
              id: "excavator-caterpillar",
              name: "Caterpillar",
              images: [],
              children: [
                {
                  id: "excavator-caterpillar-336",
                  name: "336",
                  images: [],
                  children: [
                    { id: "excavator-caterpillar-336-engine", name: "Engine", images: [], children: [] }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: "dozer",
          name: "Dozer",
          images: [],
          children: [
            {
              id: "dozer-caterpillar",
              name: "Caterpillar",
              images: [],
              children: [
                {
                  id: "dozer-caterpillar-d6",
                  name: "D6",
                  images: [],
                  children: [
                    { id: "dozer-caterpillar-d6-engine", name: "Engine", images: [], children: [] }
                  ]
                }
              ]
            },
            {
              id: "dozer-komatsu",
              name: "Komatsu",
              images: [],
              children: [
                {
                  id: "dozer-komatsu-d61",
                  name: "D61",
                  images: [],
                  children: [
                    { id: "dozer-komatsu-d61-engine", name: "Engine", images: [], children: [] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  });
}

function categoryIds(root) {
  const ids = [];

  function visit(node) {
    if (!node || node.id === "root") {
      (node?.children || []).forEach(visit);
      return;
    }

    ids.push(node.id);
    (node.children || []).forEach(visit);
  }

  visit(root);
  return ids;
}

function categoryIdSet(root) {
  return new Set(categoryIds(root));
}

function defaultDepartments(root) {
  const allSnapshotItems = LANDING_SNAPSHOT_ITEMS.map((item) => item.id);

  return [
    {
      id: DEFAULT_DEPARTMENT_ID,
      name: "Mechanics",
      landing: {
        title: "Mechanics",
        subtitle: "Service guides, repair media, and PM references."
      },
      categoryIds: [],
      snapshotItems: ["open-down-units", "work-orders-closed"]
    },
    {
      id: "crew-truck",
      name: "Crew Truck",
      landing: {
        title: "Crew Truck",
        subtitle: "Truck setup, daily checks, and field references."
      },
      categoryIds: [],
      snapshotItems: allSnapshotItems
    },
    {
      id: "maintenance-tech",
      name: "Maintenance Tech",
      landing: {
        title: "Maintenance Tech",
        subtitle: "Maintenance schedules, service references, and technician resources."
      },
      categoryIds: [],
      snapshotItems: allSnapshotItems
    },
    {
      id: "tapani-trucking",
      name: "Tapani Trucking",
      landing: {
        title: "Tapani Trucking",
        subtitle: "Maintenance schedules, service references, and technician resources."
      },
      categoryIds: [],
      snapshotItems: allSnapshotItems
    }
  ];
}

function localDepartmentData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return {
      defaultDepartmentId: parsed.defaultDepartmentId,
      departments: Array.isArray(parsed.departments) ? parsed.departments : []
    };
  } catch {
    return { defaultDepartmentId: "", departments: [] };
  }
}

export function ensureDepartments(data) {
  if (!data?.root) return data;

  const defaults = defaultDepartments(data.root);
  const byDefaultId = new Map(defaults.map((department) => [department.id, department]));
  const allSnapshotItems = LANDING_SNAPSHOT_ITEMS.map((item) => item.id);
  const validCategoryIds = categoryIdSet(data.root);
  const localDepartments = localDepartmentData();
  const sourceDepartments = Array.isArray(data.departments) && data.departments.length
    ? data.departments
    : (localDepartments.departments.length ? localDepartments.departments : defaults);
  const departments = sourceDepartments.filter((department) => byDefaultId.has(department.id));

  data.departments = (departments.length ? departments : defaults).map((department) => {
    const fallback = byDefaultId.get(department.id) || defaults[0];
    const categoryIds = Array.isArray(department.categoryIds) ? department.categoryIds : [];
    const validDepartmentCategoryIds = categoryIds.filter((id) => validCategoryIds.has(id));
    return {
      id: department.id || fallback.id,
      name: department.name || fallback.name,
      landing: {
        ...fallback.landing,
        ...(department.landing || {})
      },
      categoryIds: categoryIds.length && !validDepartmentCategoryIds.length
        ? fallback.categoryIds
        : validDepartmentCategoryIds,
      snapshotItems: Array.isArray(department.snapshotItems)
        ? department.snapshotItems.filter((id) => allSnapshotItems.includes(id))
        : (fallback.snapshotItems || allSnapshotItems)
    };
  });

  for (const fallback of defaults) {
    if (!data.departments.some((department) => department.id === fallback.id)) {
      data.departments.push(fallback);
    }
  }

  if (!data.defaultDepartmentId) {
    data.defaultDepartmentId = localDepartments.defaultDepartmentId || DEFAULT_DEPARTMENT_ID;
  }
  return data;
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
  } else {
    const accessToken = await getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function tableUrl(table, query = "") {
  const base = `${SUPABASE_CONFIG.url}/rest/v1/${table}`;
  return query ? `${base}?${query}` : base;
}

function storageObjectUrl(path = "") {
  const suffix = path ? `/${encodeURI(path)}` : "";
  return `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.storageBucket}${suffix}`;
}

async function signedStorageUrl(path) {
  if (!path || !supabase) return "";

  const { data, error } = await supabase.storage
    .from(SUPABASE_CONFIG.storageBucket)
    .createSignedUrl(path, SIGNED_MEDIA_URL_TTL_SECONDS);

  if (error) {
    throw new Error(`Supabase storage signed URL failed: ${error.message}`);
  }

  return data?.signedUrl || "";
}

export function storagePathFromMedia(item) {
  if (item?.storagePath) return item.storagePath;
  const value = item?.url || item?.dataUrl || "";
  if (typeof value !== "string" || !value) return "";

  const marker = `/storage/v1/object/public/${SUPABASE_CONFIG.storageBucket}/`;
  try {
    const parsed = new URL(value, window.location.href);
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return "";
    const path = parsed.pathname.slice(markerIndex + marker.length);
    return decodeURIComponent(path);
  } catch {
    return "";
  }
}

let supportsMediaFileName = true;
let supportsDepartmentSnapshotItems = true;
let remoteSyncLoaded = !remoteEnabled();
let lastRemoteSyncError = null;

export function hasRemoteSyncLoaded() {
  return !remoteEnabled() || remoteSyncLoaded;
}

export function getRemoteSyncError() {
  return lastRemoteSyncError;
}

function missingFileNameColumn(error) {
  const message = String(error?.message || "");
  return message.includes("file_name") && (
    message.includes("PGRST204") ||
    message.includes("42703") ||
    message.toLowerCase().includes("column")
  );
}

function missingDepartmentSnapshotItemsColumn(error) {
  const message = String(error?.message || "");
  return message.includes("snapshot_items") && (
    message.includes("PGRST204") ||
    message.includes("42703") ||
    message.toLowerCase().includes("column")
  );
}

function missingRemoteTable(error) {
  const message = String(error?.message || "");
  return message.includes("PGRST205") ||
    message.includes("42P01") ||
    message.toLowerCase().includes("could not find the table") ||
    message.toLowerCase().includes("does not exist");
}

function mediaRowsForRemote(media) {
  if (supportsMediaFileName) return media;
  return media.map(({ file_name, ...item }) => item);
}

function departmentRowsWithSupportedColumns(departments) {
  if (supportsDepartmentSnapshotItems) return departments;
  return departments.map(({ snapshot_items, ...item }) => item);
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

function safeStorageSegment(value, fallback = "item") {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-z0-9._ -]+/gi, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .replace(/^-+|-+$/g, "");

  return cleaned || fallback;
}

function fileNameFromStoragePath(path) {
  const value = String(path || "");
  const lastSegment = value.split("/").filter(Boolean).pop() || "";
  return lastSegment || "media";
}

function mediaStoragePathFor(categoryPath, item) {
  const folderPath = (categoryPath.length ? categoryPath : ["Uncategorized"])
    .map((segment) => safeStorageSegment(segment))
    .join("/");
  const fileName = safeStorageSegment(item?.fileName || fileNameFromStoragePath(storagePathFromMedia(item)), "media");
  return `${folderPath}/${fileName}`;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    console.warn("Supabase request failed.", { status: res.status, body: text });
    throw new Error(`Supabase request failed (${res.status}). ${text}`);
  }
  if (res.status === 204) return null;
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
        file_name: img.fileName || null,
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

function departmentRowsForRemote(departments) {
  return (departments || []).map((department, index) => ({
    id: department.id,
    name: department.name || department.id,
    landing_title: department.landing?.title || department.name || "",
    landing_subtitle: department.landing?.subtitle || "",
    category_ids: department.categoryIds || [],
    snapshot_items: department.snapshotItems || [],
    sort_order: index,
    updated_at: new Date().toISOString()
  }));
}

function departmentsFromRows(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    name: row.name,
    landing: {
      title: row.landing_title || row.name,
      subtitle: row.landing_subtitle || ""
    },
    categoryIds: Array.isArray(row.category_ids) ? row.category_ids : [],
    snapshotItems: Array.isArray(row.snapshot_items) ? row.snapshot_items : undefined
  }));
}

async function buildTree(categories, media, departments = []) {
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
      fileName: item.file_name || "",
      url: item.url || (item.storage_path ? await signedStorageUrl(item.storage_path) : ""),
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

  return ensureDepartments({
    version: 2,
    updatedAt: new Date().toISOString(),
    root,
    departments: departmentsFromRows(departments)
  });
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
    const next = ensureDepartments(parsed);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    return next;
  } catch {
    const seed = defaultData();
    localStorage.setItem(STORE_KEY, JSON.stringify(seed));
    return seed;
  }
}

export async function saveData(data) {
  ensureDepartments(data);
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
  const departmentQuery = supportsDepartmentSnapshotItems
    ? "select=id,name,landing_title,landing_subtitle,category_ids,snapshot_items,sort_order,updated_at&order=sort_order.asc"
    : "select=id,name,landing_title,landing_subtitle,category_ids,sort_order,updated_at&order=sort_order.asc";
  const mediaQuery = supportsMediaFileName
    ? "select=id,category_id,name,file_name,url,storage_path,sort_order,updated_at&order=sort_order.asc"
    : "select=id,category_id,name,url,storage_path,sort_order,updated_at&order=sort_order.asc";
  const [categories, media] = await Promise.all([
    requestJson(tableUrl(SUPABASE_CONFIG.categoriesTable, categoryQuery), {
      headers: await apiHeaders({ Accept: "application/json" })
    }),
    requestJson(tableUrl(SUPABASE_CONFIG.mediaTable, mediaQuery), {
      headers: await apiHeaders({ Accept: "application/json" })
    })
  ]);

  if (!categories?.length) return null;
  let departments = [];
  try {
    departments = await requestJson(tableUrl(SUPABASE_CONFIG.departmentsTable, departmentQuery), {
      headers: await apiHeaders({ Accept: "application/json" })
    });
  } catch (error) {
    if (!missingRemoteTable(error)) throw error;
    console.warn("Supabase departments table is missing. Run supabase-schema.sql to persist departments.");
  }

  return buildTree(categories, media || [], departments || []);
}

async function fetchRemoteDataWithFallback() {
  try {
    return await fetchRemoteData();
  } catch (error) {
    if (supportsMediaFileName && missingFileNameColumn(error)) {
      supportsMediaFileName = false;
      return fetchRemoteDataWithFallback();
    }
    if (supportsDepartmentSnapshotItems && missingDepartmentSnapshotItemsColumn(error)) {
      supportsDepartmentSnapshotItems = false;
      return fetchRemoteDataWithFallback();
    }
    throw error;
  }
}

export async function syncFromRemote(onUpdate) {
  if (!remoteEnabled()) return;
  try {
    const remoteData = await fetchRemoteDataWithFallback();
    remoteSyncLoaded = true;
    lastRemoteSyncError = null;
    if (!remoteData) return;

    setLocalDataRaw(remoteData);
    if (typeof onUpdate === "function") onUpdate(remoteData);
  } catch (error) {
    remoteSyncLoaded = false;
    lastRemoteSyncError = error;
    console.warn("Unable to sync from Supabase.", error);
  }
}

export async function pushRemoteData(data) {
  if (!remoteEnabled()) return;
  if (!remoteSyncLoaded) {
    throw new Error("Supabase data has not loaded yet. Refresh after the remote connection succeeds before saving changes.");
  }

  const { categories, media } = flattenTree(data.root);
  const departments = departmentRowsForRemote(data.departments);

  if (departments.length) {
    try {
      await requestJson(tableUrl(SUPABASE_CONFIG.departmentsTable, "on_conflict=id"), {
        method: "POST",
        headers: await apiHeaders({
          admin: true,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        }),
        body: JSON.stringify(departmentRowsWithSupportedColumns(departments))
      });
    } catch (error) {
      if (!supportsDepartmentSnapshotItems || !missingDepartmentSnapshotItemsColumn(error)) throw error;
      supportsDepartmentSnapshotItems = false;
      await requestJson(tableUrl(SUPABASE_CONFIG.departmentsTable, "on_conflict=id"), {
        method: "POST",
        headers: await apiHeaders({
          admin: true,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        }),
        body: JSON.stringify(departmentRowsWithSupportedColumns(departments))
      });
    }
  }

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
    try {
      await requestJson(tableUrl(SUPABASE_CONFIG.mediaTable, "on_conflict=id"), {
        method: "POST",
        headers: await apiHeaders({
          admin: true,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        }),
        body: JSON.stringify(mediaRowsForRemote(media))
      });
    } catch (error) {
      if (!supportsMediaFileName || !missingFileNameColumn(error)) throw error;
      supportsMediaFileName = false;
      await requestJson(tableUrl(SUPABASE_CONFIG.mediaTable, "on_conflict=id"), {
        method: "POST",
        headers: await apiHeaders({
          admin: true,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        }),
        body: JSON.stringify(mediaRowsForRemote(media))
      });
    }
  }

  const staleStoragePaths = await storagePathsForRowsNotIn(media.map(item => item.id));
  await deleteRowsNotIn(SUPABASE_CONFIG.departmentsTable, departments.map(item => item.id));
  await deleteRowsNotIn(SUPABASE_CONFIG.mediaTable, media.map(item => item.id));
  await deleteRowsNotIn(SUPABASE_CONFIG.categoriesTable, categories.map(item => item.id));

  try {
    await removeStorageObjects(staleStoragePaths);
  } catch (error) {
    console.warn(error);
  }
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

async function storagePathsForRowsNotIn(ids) {
  const filter = ids.length
    ? `id=not.in.(${ids.map(id => `"${String(id).replaceAll('"', '\\"')}"`).join(",")})&storage_path=not.is.null`
    : "id=not.is.null&storage_path=not.is.null";

  const rows = await requestJson(tableUrl(SUPABASE_CONFIG.mediaTable, `select=storage_path&${filter}`), {
    headers: await apiHeaders({ admin: true, Accept: "application/json" })
  });

  return (rows || []).map((row) => row.storage_path).filter(Boolean);
}

export async function uploadMediaFile(file, categoryId, categoryPath = []) {
  const id = crypto.randomUUID?.() || uid();
  if (!remoteEnabled()) {
    return {
      id,
      name: file.name,
      fileName: file.name,
      dataUrl: await fileToDataUrl(file)
    };
  }

  const folderPath = (categoryPath.length ? categoryPath : [categoryId])
    .map((segment) => safeStorageSegment(segment))
    .join("/");
  const safeName = safeStorageSegment(file.name, "media");
  const path = `${folderPath}/${safeName}`;
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
    fileName: file.name,
    url: await signedStorageUrl(path),
    storagePath: path
  };
}

export async function alignMediaStoragePaths(root) {
  if (!remoteEnabled()) return;
  await requireAdminAccessToken();
  if (!supabase) throw new Error("Supabase is not configured.");

  async function visit(node, categoryPath) {
    const nextPath = node.id === "root" ? [] : [...categoryPath, node.name];

    for (const img of node.images || []) {
      const currentPath = storagePathFromMedia(img);
      if (!currentPath) continue;

      const nextStoragePath = mediaStoragePathFor(nextPath, img);
      if (currentPath === nextStoragePath) continue;

      const { error } = await supabase.storage
        .from(SUPABASE_CONFIG.storageBucket)
        .move(currentPath, nextStoragePath);

      if (error) {
        throw new Error(`Supabase storage move failed: ${currentPath} -> ${nextStoragePath}: ${error.message}`);
      }

      img.storagePath = nextStoragePath;
      img.url = await signedStorageUrl(nextStoragePath);
    }

    for (const child of node.children || []) {
      await visit(child, nextPath);
    }
  }

  await visit(root, []);
}

export async function removeStorageObject(path) {
  await removeStorageObjects([path]);
}

function isMissingStorageObjectError(error) {
  const message = String(error?.message || "").toLowerCase();
  const statusCode = String(error?.statusCode || error?.status || "");
  return statusCode === "404" || message.includes("404") || (
    message.includes("not found") ||
    message.includes("resource was not found") ||
    message.includes("object not found")
  );
}

export async function removeStorageObjects(paths) {
  if (!remoteEnabled()) return;
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  if (!uniquePaths.length) return;

  await requireAdminAccessToken();

  for (let index = 0; index < uniquePaths.length; index += 1000) {
    const chunk = uniquePaths.slice(index, index + 1000);
    try {
      await requestJson(storageObjectUrl(), {
        method: "DELETE",
        headers: await apiHeaders({
          admin: true,
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({ prefixes: chunk })
      });
    } catch (error) {
      if (isMissingStorageObjectError(error)) continue;
      throw new Error(`Supabase storage cleanup failed: ${error.message}. Paths: ${chunk.join(", ")}`);
    }
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
