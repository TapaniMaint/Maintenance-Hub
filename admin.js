import {
  loadData,
  saveData,
  syncFromRemote,
  findNode,
  removeNodeById,
  uploadMediaFile,
  removeStorageObject
} from "./app.js";
import {
  getUser,
  isAdminUser,
  onAuthStateChange,
  signInWithPassword,
  signOut
} from "./supabase-client.js";

const EXPANDED_KEY_ADMIN = "maintenanceHubExpanded_admin_v1";
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/ogg"]);
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".ogv"];

let data = loadData();
let selectedId = data.root.children[0]?.id || "root";
let expanded = loadExpanded();
let adminEnabled = false;

const authForm = document.getElementById("authForm");
const adminWorkspace = document.getElementById("adminWorkspace");
const signOutBtn = document.getElementById("signOutBtn");
const authSummary = document.getElementById("authSummary");
const statusBanner = document.getElementById("statusBanner");
const emailInput = document.getElementById("adminEmail");
const passwordInput = document.getElementById("adminPassword");

function applyRemote(next) {
  data = next;
  if (!findNode(data.root, selectedId)) {
    selectedId = data.root.children[0]?.id || "root";
  }
  renderTree();
}

const treeToggleBtn = document.getElementById("treeToggleBtn");
const overlay = document.getElementById("overlay");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function toggleSidebar() {
  if (!adminEnabled) return;
  document.body.classList.toggle("sidebar-open");
}

treeToggleBtn?.addEventListener("click", toggleSidebar);
overlay?.addEventListener("click", closeSidebar);
sidebarCloseBtn?.addEventListener("click", closeSidebar);
window.addEventListener("resize", () => {
  if (window.innerWidth > 720) closeSidebar();
});

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxVideo = document.getElementById("lightboxVideo");
const lightboxCaption = document.getElementById("lightboxCaption");

function openLightbox(src, caption = "", mediaType = "image") {
  if (mediaType === "video") {
    lightboxImg.hidden = true;
    lightboxImg.src = "";
    lightboxVideo.hidden = false;
    lightboxVideo.src = src;
  } else {
    lightboxVideo.hidden = true;
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    lightboxVideo.load();
    lightboxImg.hidden = false;
    lightboxImg.src = src;
  }
  lightboxCaption.textContent = caption;
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
}

lightbox?.addEventListener("click", () => {
  lightbox.classList.remove("open");
  lightboxImg.src = "";
  lightboxVideo.pause();
  lightboxVideo.removeAttribute("src");
  lightboxVideo.load();
  document.body.style.overflow = "";
});
lightboxImg?.addEventListener("click", (event) => event.stopPropagation());
lightboxVideo?.addEventListener("click", (event) => event.stopPropagation());

function normalizeOneDriveUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  const parsed = new URL(trimmed, window.location.href);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS media links are allowed.");
  }

  if (/onedrive|sharepoint/i.test(parsed.hostname) && !parsed.searchParams.has("download")) {
    parsed.searchParams.set("download", "1");
  }

  return parsed.href;
}

function safeMediaUrl(value) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/") || trimmed.startsWith("data:video/")) return trimmed;
  if (trimmed.startsWith("blob:")) return trimmed;

  try {
    const parsed = new URL(trimmed, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return "";
  }

  return "";
}

function mediaTypeFor(item, src = "") {
  const value = `${item?.name || ""} ${src || item?.url || item?.dataUrl || ""}`.toLowerCase();
  if (value.startsWith("data:video/") || /\.(mp4|mov|webm|ogv)(?:[?#]|$)/i.test(value)) return "video";
  return "image";
}

function setStatus(message, type = "info") {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

function setAdminEnabledState(enabled) {
  adminEnabled = enabled;
  adminWorkspace?.classList.toggle("hidden", !enabled);
}

function loadExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY_ADMIN);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveExpanded() {
  localStorage.setItem(EXPANDED_KEY_ADMIN, JSON.stringify([...expanded]));
}

const elImgUrlInput = document.getElementById("imgUrlInput");
const elImgUrlName = document.getElementById("imgUrlName");
const elAddMasterInput = document.getElementById("addMasterInput");
const elTree = document.getElementById("tree");
const elUpdatedAt = document.getElementById("updatedAt");
const elSelectedPath = document.getElementById("selectedPath");
const elRenameInput = document.getElementById("renameInput");
const elAddChildInput = document.getElementById("addChildInput");
const elGallery = document.getElementById("gallery");
const elImgInput = document.getElementById("imgInput");

const pageFab = document.getElementById("pageFab");
const pageFabBtn = document.getElementById("pageFabBtn");
const pageFabBackdrop = document.getElementById("pageFabBackdrop");
const fabUserLink = document.getElementById("fabUserLink");

if (pageFab && pageFabBtn && pageFabBackdrop && fabUserLink) {
  function closeFab() {
    pageFab.classList.remove("open");
  }

  function toggleFab() {
    pageFab.classList.toggle("open");
  }

  pageFabBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFab();
  });

  pageFabBackdrop.addEventListener("click", closeFab);
  document.addEventListener("click", (event) => {
    if (!pageFab.contains(event.target)) closeFab();
  });
  fabUserLink.addEventListener("click", closeFab);
}

function fmtUpdated() {
  elUpdatedAt.textContent = new Date(data.updatedAt).toLocaleString();
}

function findParent(root, id) {
  if (!root?.children) return null;
  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index];
    if (child.id === id) return { parent: root, index };
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

function collectStoragePaths(node, paths = []) {
  for (const img of node?.images || []) {
    if (img.storagePath) paths.push(img.storagePath);
  }
  for (const child of node?.children || []) {
    collectStoragePaths(child, paths);
  }
  return paths;
}

function pathText(path) {
  return path.map((node) => node.name).join(" -> ");
}

function renderTree() {
  if (!adminEnabled) return;

  elTree.innerHTML = "";
  fmtUpdated();
  for (const child of data.root.children) renderNodeRow(child, 0);
  renderSelectedPanel();
}

function renderNodeRow(node, depth) {
  const row = document.createElement("div");
  row.className = "tree-item" + (node.id === selectedId ? " selected" : "");
  row.style.marginLeft = `${depth * 12}px`;
  row.draggable = true;
  row.dataset.depth = String(depth);
  if (depth > 0) row.classList.add(`depth-${Math.min(depth, 6)}`);

  const left = document.createElement("div");
  left.className = "left";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = node.name;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `(${(node.children || []).length} child, ${(node.images || []).length} media)`;

  left.appendChild(name);
  left.appendChild(meta);
  row.appendChild(left);
  row.appendChild(document.createElement("div"));

  row.addEventListener("click", () => {
    selectedId = node.id;

    if ((node.children || []).length > 0) {
      if (expanded.has(node.id)) expanded.delete(node.id);
      else expanded.add(node.id);
      saveExpanded();
    }

    renderTree();
  });

  row.addEventListener("dragstart", (event) => {
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  });

  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
  });

  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  row.addEventListener("dragenter", (event) => {
    event.preventDefault();
    row.classList.add("drag-over");
  });

  row.addEventListener("dragleave", () => {
    row.classList.remove("drag-over");
  });

  row.addEventListener("drop", async (event) => {
    event.preventDefault();
    row.classList.remove("drag-over");

    const draggedId = event.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === node.id) return;

    const draggedInfo = findParent(data.root, draggedId);
    const targetInfo = findParent(data.root, node.id);
    if (!draggedInfo || !targetInfo) return;
    if (draggedInfo.parent.id !== targetInfo.parent.id) return;

    const siblings = targetInfo.parent.children;
    const [moved] = siblings.splice(draggedInfo.index, 1);
    let insertIndex = targetInfo.index;
    if (draggedInfo.index < targetInfo.index) insertIndex -= 1;
    siblings.splice(insertIndex, 0, moved);

    await persistData();
  });

  elTree.appendChild(row);

  if ((node.children || []).length > 0 && expanded.has(node.id)) {
    for (const child of node.children || []) renderNodeRow(child, depth + 1);
  }
}

function renderSelectedPanel() {
  const found = findNode(data.root, selectedId);
  if (!found) return;

  const { node, path } = found;
  elSelectedPath.textContent = pathText(path);
  elRenameInput.value = node.name;
  elGallery.innerHTML = "";

  const imgs = node.images || [];
  if (imgs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "No media on this node.";
    elGallery.appendChild(empty);
    return;
  }

  imgs.forEach((img, index) => {
    const src = safeMediaUrl(img.url || img.dataUrl || "");
    if (!src) return;
    const mediaType = mediaTypeFor(img, src);

    const card = document.createElement("div");
    card.className = "card";

    const media = mediaType === "video" ? document.createElement("video") : document.createElement("img");
    media.src = src;
    media.style.cursor = "zoom-in";
    if (mediaType === "video") {
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
    } else {
      media.alt = img.name || "image";
    }
    media.addEventListener("click", () => openLightbox(src, img.name || "", mediaType));

    const cap = document.createElement("div");
    cap.className = "cap";

    const label = document.createElement("span");
    label.className = "media-label";
    label.textContent = img.name || mediaType;

    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.className = "danger media-remove";
    removeButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await removeStorageObject(img.storagePath);
      node.images.splice(index, 1);
      await persistData();
    });

    cap.appendChild(label);
    cap.appendChild(removeButton);
    card.appendChild(media);
    card.appendChild(cap);
    elGallery.appendChild(card);
  });
}

function validateUploadFiles(files) {
  if (!files.length) {
    throw new Error("Choose at least one media file to upload.");
  }

  for (const file of files) {
    const dotIndex = file.name.lastIndexOf(".");
    const extension = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : "";
    const isImageExt = ALLOWED_IMAGE_EXTENSIONS.includes(extension);
    const isVideoExt = ALLOWED_VIDEO_EXTENSIONS.includes(extension);
    const hasUnknownType = !file.type || file.type === "application/octet-stream";
    const isImage = isImageExt && (hasUnknownType || ALLOWED_IMAGE_TYPES.has(file.type));
    const isVideo = isVideoExt && (hasUnknownType || ALLOWED_VIDEO_TYPES.has(file.type));
    if (!isImage && !isVideo) {
      throw new Error(`Blocked upload: ${file.name} is not a supported image or video file.`);
    }

    const maxSize = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
    const maxSizeLabel = isVideo ? "50 MB" : "5 MB";
    if (file.size > maxSize) {
      throw new Error(`Blocked upload: ${file.name} exceeds the ${maxSizeLabel} limit.`);
    }
  }
}

async function persistData() {
  try {
    await saveData(data);
    data = loadData();
    renderTree();
    setStatus("Changes saved to Supabase using the current admin session.", "success");
  } catch (error) {
    data = loadData();
    renderTree();
    setStatus(error.message || "Unable to save changes.", "error");
    throw error;
  }
}

async function refreshAuthState() {
  const user = await getUser();
  const admin = await isAdminUser();

  if (!user) {
    signOutBtn.hidden = true;
    authSummary.textContent = "Write access stays blocked until an admin session is active.";
    setAdminEnabledState(false);
    setStatus("Public reads are available. Admin writes require sign-in.", "info");
    return;
  }

  signOutBtn.hidden = false;
  if (!admin) {
    authSummary.textContent = `Signed in as ${user.email || "unknown user"}, but this account is not marked as an admin.`;
    setAdminEnabledState(false);
    setStatus("Sign in with a user whose app metadata contains the admin role.", "error");
    return;
  }

  authSummary.textContent = `Signed in as ${user.email || "admin"} with Supabase Auth.`;
  setAdminEnabledState(true);
  setStatus("Admin session active. Supabase writes now use the user's access token.", "success");
  renderTree();
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Signing in...", "info");

  try {
    await signInWithPassword(emailInput.value.trim(), passwordInput.value);
    passwordInput.value = "";
    await refreshAuthState();
  } catch (error) {
    setAdminEnabledState(false);
    setStatus(error.message || "Sign-in failed.", "error");
  }
});

signOutBtn?.addEventListener("click", async () => {
  try {
    await signOut();
    setAdminEnabledState(false);
    setStatus("Signed out.", "info");
    await refreshAuthState();
  } catch (error) {
    setStatus(error.message || "Sign-out failed.", "error");
  }
});

document.getElementById("addImgUrlBtn")?.addEventListener("click", async () => {
  const found = findNode(data.root, selectedId);
  if (!found) return;

  try {
    const rawUrl = (elImgUrlInput?.value || "").trim();
    if (!rawUrl) throw new Error("Paste a media URL first.");

    const url = normalizeOneDriveUrl(rawUrl);
    const name = (elImgUrlName?.value || "").trim() || "Linked media";

    found.node.images = found.node.images || [];
    found.node.images.push({
      id: crypto.randomUUID?.() || String(Date.now()),
      name,
      url
    });

    if (elImgUrlInput) elImgUrlInput.value = "";
    if (elImgUrlName) elImgUrlName.value = "";

    await persistData();
  } catch (error) {
    setStatus(error.message || "Unable to add the media link.", "error");
  }
});

document.getElementById("addMasterBtn")?.addEventListener("click", async () => {
  const name = (elAddMasterInput?.value || "").trim();
  if (!name) return;

  data.root.children = data.root.children || [];
  const newNode = {
    id: `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    name,
    images: [],
    children: []
  };

  data.root.children.push(newNode);
  selectedId = newNode.id;
  expanded.add(newNode.id);
  saveExpanded();
  if (elAddMasterInput) elAddMasterInput.value = "";

  await persistData();
});

document.getElementById("renameBtn")?.addEventListener("click", async () => {
  const found = findNode(data.root, selectedId);
  if (!found) return;

  const name = elRenameInput.value.trim();
  if (!name) return;

  found.node.name = name;
  await persistData();
});

document.getElementById("addChildBtn")?.addEventListener("click", async () => {
  const found = findNode(data.root, selectedId);
  if (!found) return;

  const name = elAddChildInput.value.trim();
  if (!name) return;

  found.node.children = found.node.children || [];
  found.node.children.push({
    id: `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    name,
    images: [],
    children: []
  });

  expanded.add(found.node.id);
  saveExpanded();
  elAddChildInput.value = "";

  await persistData();
});

document.getElementById("deleteBtn")?.addEventListener("click", async () => {
  if (selectedId === "root") return;

  const found = findNode(data.root, selectedId);
  if (!found) return;

  try {
    for (const path of collectStoragePaths(found.node)) {
      await removeStorageObject(path);
    }

    removeNodeById(data.root, selectedId);
    selectedId = data.root.children[0]?.id || "root";
    await persistData();
  } catch (error) {
    setStatus(error.message || "Unable to delete the selected node.", "error");
  }
});

document.getElementById("addImagesBtn")?.addEventListener("click", async () => {
  const found = findNode(data.root, selectedId);
  if (!found) return;

  try {
    const files = Array.from(elImgInput.files || []);
    validateUploadFiles(files);

    found.node.images = found.node.images || [];
    for (const file of files) {
      found.node.images.push(await uploadMediaFile(file, selectedId));
    }

    elImgInput.value = "";
    await persistData();
  } catch (error) {
    setStatus(error.message || "Upload failed.", "error");
  }
});

document.getElementById("clearImagesBtn")?.addEventListener("click", async () => {
  const found = findNode(data.root, selectedId);
  if (!found) return;

  try {
    for (const img of found.node.images || []) {
      await removeStorageObject(img.storagePath);
    }

    found.node.images = [];
    await persistData();
  } catch (error) {
    setStatus(error.message || "Unable to clear media.", "error");
  }
});

onAuthStateChange(() => {
  void refreshAuthState();
});

syncFromRemote(applyRemote);
setInterval(() => syncFromRemote(applyRemote), 15000);

void refreshAuthState();
