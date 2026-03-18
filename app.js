

const STORE_KEY = "maintenanceHubData_v1";

function remoteEnabled() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultData() {
  return {
    version: 1,
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

export function saveData(data) {
  data.updatedAt = new Date().toISOString();
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  void pushRemoteData(data);
}

export function resetData() {
  const seed = defaultData();
  localStorage.setItem(STORE_KEY, JSON.stringify(seed));
  return seed;
}

async function fetchRemoteRow() {
  if (!remoteEnabled()) return null;
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${SUPABASE_ROW_ID}&select=id,data,updated_at`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

export async function syncFromRemote(onUpdate) {
  if (!remoteEnabled()) return;
  try {
    const row = await fetchRemoteRow();
    if (!row || !row.data) return;

    const local = loadData();
    const remoteTime = Date.parse(row.data.updatedAt || row.updated_at || 0);
    const localTime = Date.parse(local.updatedAt || 0);

    if (remoteTime > localTime) {
      setLocalDataRaw(row.data);
      if (typeof onUpdate === "function") onUpdate(row.data);
    }
  } catch {
    // ignore sync errors
  }
}

export async function pushRemoteData(data) {
  if (!remoteEnabled()) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`;
    await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        id: SUPABASE_ROW_ID,
        data,
        updated_at: data.updatedAt
      })
    });
  } catch {
    // ignore sync errors
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
