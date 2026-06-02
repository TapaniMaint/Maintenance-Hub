import {
  loadData,
  saveData,
  syncFromRemote,
  findNode,
  countDescendants,
  removeNodeById,
  uploadMediaFile,
  removeStorageObject,
  storagePathFromMedia,
  alignMediaStoragePaths
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
let selectedMediaKeys = new Set();

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
const sidebar = document.getElementById("sidebar");
const collapseTreeBtn = document.getElementById("collapseTreeBtn");

function isSidebarDrawer() {
  return window.innerWidth <= 980;
}

function syncSidebarState() {
  const isOpen = document.body.classList.contains("sidebar-open");
  treeToggleBtn?.setAttribute("aria-expanded", String(isOpen));
  sidebar?.setAttribute("aria-hidden", String(!isOpen && isSidebarDrawer()));
  if (overlay) overlay.hidden = !isOpen;
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  syncSidebarState();
}

function toggleSidebar() {
  if (!adminEnabled) return;
  document.body.classList.toggle("sidebar-open");
  syncSidebarState();
}

treeToggleBtn?.addEventListener("click", toggleSidebar);
overlay?.addEventListener("click", closeSidebar);
sidebarCloseBtn?.addEventListener("click", closeSidebar);
collapseTreeBtn?.addEventListener("click", () => {
  expanded.clear();
  saveExpanded();
  renderTree();
});
window.addEventListener("resize", () => {
  if (!isSidebarDrawer()) closeSidebar();
  else syncSidebarState();
  syncImageZoomMode();
});
syncSidebarState();

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxVideo = document.getElementById("lightboxVideo");
const lightboxCaption = document.getElementById("lightboxCaption");
let imageZoom = 1;
let imagePanX = 0;
let imagePanY = 0;
let imageDrag = null;
const desktopImageZoomQuery = window.matchMedia?.("(min-width: 981px) and (pointer: fine)");

function canUseCustomImageZoom() {
  return desktopImageZoomQuery?.matches ?? window.innerWidth > 980;
}

function applyImageZoom() {
  lightboxImg.style.transform = `translate(${imagePanX}px, ${imagePanY}px) scale(${imageZoom})`;
  lightboxImg.classList.toggle("zoomed", imageZoom > 1);
}

function resetImageZoom() {
  imageZoom = 1;
  imagePanX = 0;
  imagePanY = 0;
  imageDrag = null;
  applyImageZoom();
}

function syncImageZoomMode() {
  if (!lightbox?.classList.contains("open") || lightboxImg.hidden) return;
  const enabled = canUseCustomImageZoom();
  lightbox.classList.toggle("desktop-zoom", enabled);
  if (!enabled) resetImageZoom();
}

function openLightbox(src, caption = "", mediaType = "image") {
  resetImageZoom();
  lightbox.hidden = false;
  lightbox.classList.toggle("desktop-zoom", mediaType === "image" && canUseCustomImageZoom());
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
  lightbox.classList.remove("desktop-zoom");
  lightbox.hidden = true;
  resetImageZoom();
  lightboxImg.src = "";
  lightboxVideo.pause();
  lightboxVideo.removeAttribute("src");
  lightboxVideo.load();
  document.body.style.overflow = "";
});
lightboxImg?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!canUseCustomImageZoom()) return;
  if (imageZoom === 1) {
    imageZoom = 2;
  } else {
    resetImageZoom();
    return;
  }
  applyImageZoom();
});
lightboxImg?.addEventListener("wheel", (event) => {
  if (!canUseCustomImageZoom()) return;
  event.preventDefault();
  event.stopPropagation();
  imageZoom = Math.min(4, Math.max(1, imageZoom + (event.deltaY < 0 ? 0.25 : -0.25)));
  if (imageZoom === 1) {
    imagePanX = 0;
    imagePanY = 0;
  }
  applyImageZoom();
}, { passive: false });
lightboxImg?.addEventListener("pointerdown", (event) => {
  if (!canUseCustomImageZoom()) return;
  if (imageZoom <= 1) return;
  event.preventDefault();
  event.stopPropagation();
  lightboxImg.setPointerCapture(event.pointerId);
  imageDrag = { x: event.clientX, y: event.clientY, panX: imagePanX, panY: imagePanY };
});
lightboxImg?.addEventListener("pointermove", (event) => {
  if (!canUseCustomImageZoom()) return;
  if (!imageDrag) return;
  imagePanX = imageDrag.panX + event.clientX - imageDrag.x;
  imagePanY = imageDrag.panY + event.clientY - imageDrag.y;
  applyImageZoom();
});
lightboxImg?.addEventListener("pointerup", () => {
  imageDrag = null;
});
lightboxImg?.addEventListener("pointercancel", () => {
  imageDrag = null;
});
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

function fileNameFromUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    const lastSegment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return lastSegment || "";
  } catch {
    return "";
  }
}

function setStatus(message, type = "info") {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

function setAdminEnabledState(enabled) {
  adminEnabled = enabled;
  adminWorkspace?.classList.toggle("hidden", !enabled);
  if (!enabled) closeSidebar();
  syncSidebarState();
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
const elSelectedPath = document.getElementById("selectedPath");
const elRenameInput = document.getElementById("renameInput");
const elAddChildInput = document.getElementById("addChildInput");
const elGallery = document.getElementById("gallery");
const elImgInput = document.getElementById("imgInput");
const elClearImagesBtn = document.getElementById("clearImagesBtn");
const categoryDeleteModal = document.getElementById("categoryDeleteModal");
const categoryDeleteMessage = document.getElementById("categoryDeleteMessage");
const cancelCategoryDeleteBtn = document.getElementById("cancelCategoryDeleteBtn");
const confirmCategoryDeleteBtn = document.getElementById("confirmCategoryDeleteBtn");

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

function clearTreeDropState() {
  for (const item of elTree?.querySelectorAll(".drag-over, .drop-before, .drop-after, .drop-inside") || []) {
    item.classList.remove("drag-over", "drop-before", "drop-after", "drop-inside");
  }
}

function dropPositionForEvent(event, row) {
  const rect = row.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  if (offsetY < rect.height * 0.25) return "before";
  if (offsetY > rect.height * 0.75) return "after";
  return "inside";
}

function isDescendantOrSelf(node, id) {
  if (!node) return false;
  if (node.id === id) return true;
  return (node.children || []).some((child) => isDescendantOrSelf(child, id));
}

function moveCategory(draggedId, targetId, position) {
  if (!draggedId || !targetId || draggedId === targetId) return false;

  const dragged = findNode(data.root, draggedId)?.node;
  if (!dragged) return false;
  if (isDescendantOrSelf(dragged, targetId)) return false;

  const draggedInfo = findParent(data.root, draggedId);
  if (!draggedInfo) return false;

  const [moved] = draggedInfo.parent.children.splice(draggedInfo.index, 1);

  if (position === "inside") {
    const target = findNode(data.root, targetId)?.node;
    if (!target) {
      draggedInfo.parent.children.splice(draggedInfo.index, 0, moved);
      return false;
    }
    target.children = target.children || [];
    target.children.push(moved);
    expanded.add(target.id);
    saveExpanded();
    return true;
  }

  const targetInfo = findParent(data.root, targetId);
  if (!targetInfo) {
    draggedInfo.parent.children.splice(draggedInfo.index, 0, moved);
    return false;
  }

  const insertIndex = position === "after" ? targetInfo.index + 1 : targetInfo.index;
  targetInfo.parent.children.splice(insertIndex, 0, moved);
  return true;
}

function collectStoragePaths(node, paths = []) {
  for (const img of node?.images || []) {
    const path = storagePathFromMedia(img);
    if (path) paths.push(path);
  }
  for (const child of node?.children || []) {
    collectStoragePaths(child, paths);
  }
  return paths;
}

function countMediaItems(node) {
  let count = (node?.images || []).length;
  for (const child of node?.children || []) {
    count += countMediaItems(child);
  }
  return count;
}

function confirmCategoryDelete(node) {
  const childCount = countDescendants(node);
  const mediaCount = countMediaItems(node);
  const childLabel = childCount === 1 ? "1 child category" : `${childCount} child categories`;
  const mediaLabel = mediaCount === 1 ? "1 media item" : `${mediaCount} media items`;

  if (!categoryDeleteModal || !categoryDeleteMessage || !cancelCategoryDeleteBtn || !confirmCategoryDeleteBtn) {
    return Promise.resolve(window.confirm(`Delete "${node.name}" and everything under it?`));
  }

  categoryDeleteMessage.textContent = `Delete "${node.name}"? This will remove ${childLabel} and ${mediaLabel}.`;
  categoryDeleteModal.classList.add("open");
  categoryDeleteModal.setAttribute("aria-hidden", "false");
  cancelCategoryDeleteBtn.focus();

  return new Promise((resolve) => {
    function close(confirmed) {
      categoryDeleteModal.classList.remove("open");
      categoryDeleteModal.setAttribute("aria-hidden", "true");
      cancelCategoryDeleteBtn.removeEventListener("click", onCancel);
      confirmCategoryDeleteBtn.removeEventListener("click", onConfirm);
      categoryDeleteModal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      resolve(confirmed);
    }

    function onCancel() {
      close(false);
    }

    function onConfirm() {
      close(true);
    }

    function onBackdrop(event) {
      if (event.target === categoryDeleteModal) close(false);
    }

    function onKeydown(event) {
      if (event.key === "Escape") close(false);
    }

    cancelCategoryDeleteBtn.addEventListener("click", onCancel);
    confirmCategoryDeleteBtn.addEventListener("click", onConfirm);
    categoryDeleteModal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

function pathText(path) {
  return path.map((node) => node.name).join(" -> ");
}

function mediaSelectionKey(img, index) {
  return img.id || `${index}:${img.storagePath || img.url || img.dataUrl || img.name || ""}`;
}

function displayMediaName(img, fallback = "media") {
  return (img?.name || "").trim() || fallback;
}

function displayFileName(img) {
  return (img?.fileName || "").trim();
}

function syncClearMediaButton() {
  if (!elClearImagesBtn) return;
  const count = selectedMediaKeys.size;
  elClearImagesBtn.disabled = count === 0;
  elClearImagesBtn.textContent = count === 0 ? "Delete selected media" : `Delete selected media (${count})`;
}

function renderTree() {
  if (!adminEnabled) return;

  elTree.innerHTML = "";
  for (const child of data.root.children) renderNodeRow(child, 0);
  renderSelectedPanel();
}

function renderNodeRow(node, depth) {
  const row = document.createElement("button");
  const hasChildren = (node.children || []).length > 0;
  const isExpanded = expanded.has(node.id);
  row.type = "button";
  row.className = "tree-item" + (node.id === selectedId ? " selected" : "");
  row.style.setProperty("--tree-depth", String(depth));
  row.draggable = true;
  row.dataset.depth = String(depth);
  row.setAttribute("aria-current", node.id === selectedId ? "true" : "false");
  if (hasChildren) row.setAttribute("aria-expanded", String(isExpanded));
  if (depth > 0) row.classList.add(`depth-${Math.min(depth, 6)}`);

  const left = document.createElement("div");
  left.className = "left";

  const toggleIndicator = document.createElement("span");
  toggleIndicator.className = "tree-toggle-indicator";
  toggleIndicator.setAttribute("aria-hidden", "true");
  if (hasChildren && isExpanded) toggleIndicator.classList.add("expanded");
  if (!hasChildren) toggleIndicator.classList.add("leaf");

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = node.name;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `(${(node.children || []).length} child, ${(node.images || []).length} media)`;

  left.appendChild(toggleIndicator);
  left.appendChild(name);
  left.appendChild(meta);
  row.appendChild(left);
  const spacer = document.createElement("span");
  spacer.setAttribute("aria-hidden", "true");
  row.appendChild(spacer);

  row.addEventListener("click", () => {
    if (selectedId !== node.id) selectedMediaKeys.clear();
    selectedId = node.id;

    if (hasChildren) {
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
    clearTreeDropState();
  });

  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const position = dropPositionForEvent(event, row);
    clearTreeDropState();
    row.classList.add("drag-over", `drop-${position}`);
  });

  row.addEventListener("dragenter", (event) => {
    event.preventDefault();
  });

  row.addEventListener("dragleave", () => {
    row.classList.remove("drag-over", "drop-before", "drop-after", "drop-inside");
  });

  row.addEventListener("drop", async (event) => {
    event.preventDefault();
    const position = dropPositionForEvent(event, row);
    clearTreeDropState();

    const draggedId = event.dataTransfer.getData("text/plain");
    if (!moveCategory(draggedId, node.id, position)) {
      setStatus("Drop blocked. A category cannot be moved into itself or one of its child categories.", "error");
      renderTree();
      return;
    }

    await persistData();
  });

  elTree.appendChild(row);

  if (hasChildren && expanded.has(node.id)) {
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
    selectedMediaKeys.clear();
    syncClearMediaButton();
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
    const mediaName = displayMediaName(img, mediaType);
    const key = mediaSelectionKey(img, index);

    const card = document.createElement("div");
    card.className = "card";
    if (mediaType === "video") card.classList.add("card-video");

    const media = mediaType === "video" ? document.createElement("video") : document.createElement("img");
    media.src = src;
    media.className = "media-lightbox-trigger";
    if (mediaType === "video") {
      media.controls = false;
      media.muted = true;
      media.defaultMuted = true;
      media.loop = true;
      media.autoplay = false;
      media.playsInline = true;
      media.preload = "metadata";
    } else {
      media.alt = mediaName;
    }
    media.addEventListener("click", () => openLightbox(src, displayMediaName(img, mediaType), mediaType));

    if (mediaType === "video") {
      const badge = document.createElement("div");
      badge.className = "video-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "VIDEO";
      card.appendChild(badge);
    }

    const cap = document.createElement("div");
    cap.className = "cap";

    const selectLabel = document.createElement("label");
    selectLabel.className = "media-select";
    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.setAttribute("aria-label", `Select ${mediaName} for deletion`);
    selectInput.checked = selectedMediaKeys.has(key);
    selectInput.addEventListener("click", (event) => event.stopPropagation());
    selectInput.addEventListener("change", () => {
      if (selectInput.checked) selectedMediaKeys.add(key);
      else selectedMediaKeys.delete(key);
      syncClearMediaButton();
    });
    selectLabel.appendChild(selectInput);

    const nameEditor = document.createElement("div");
    nameEditor.className = "media-name-editor";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "media-name-input";
    nameInput.value = mediaName;
    nameInput.placeholder = "Media name";
    nameInput.setAttribute("aria-label", `Media name for ${mediaName}`);
    nameInput.addEventListener("pointerdown", (event) => event.stopPropagation());
    nameInput.addEventListener("click", (event) => event.stopPropagation());
    nameInput.addEventListener("input", () => {
      const nextName = nameInput.value.trim();
      saveNameButton.disabled = !nextName || nextName === displayMediaName(img, mediaType);
    });
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !saveNameButton.disabled) {
        event.preventDefault();
        saveNameButton.click();
      }
    });

    const saveNameButton = document.createElement("button");
    saveNameButton.type = "button";
    saveNameButton.className = "media-name-save";
    saveNameButton.textContent = "Save";
    saveNameButton.disabled = true;
    saveNameButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const nextName = nameInput.value.trim();
      if (!nextName || nextName === displayMediaName(img, mediaType)) return;
      img.name = nextName;
      await persistData();
    });

    nameEditor.appendChild(nameInput);
    nameEditor.appendChild(saveNameButton);

    const fileName = displayFileName(img);
    const fileMeta = document.createElement("div");
    fileMeta.className = "media-file-name";
    fileMeta.textContent = fileName ? `File: ${fileName}` : "File: linked media";

    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.className = "danger media-remove";
    removeButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const name = displayMediaName(img, "this media item");
      if (!window.confirm(`Delete "${name}" from this node?`)) return;
      await removeStorageObject(storagePathFromMedia(img));
      selectedMediaKeys.delete(key);
      node.images.splice(index, 1);
      await persistData();
    });

    cap.appendChild(selectLabel);
    cap.appendChild(nameEditor);
    cap.appendChild(fileMeta);
    cap.appendChild(removeButton);
    card.appendChild(media);
    card.appendChild(cap);
    elGallery.appendChild(card);
  });

  const currentKeys = new Set(imgs.map((img, index) => mediaSelectionKey(img, index)));
  selectedMediaKeys = new Set([...selectedMediaKeys].filter((key) => currentKeys.has(key)));
  syncClearMediaButton();
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
    await alignMediaStoragePaths(data.root);
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
      fileName: fileNameFromUrl(url),
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
    if (!await confirmCategoryDelete(found.node)) return;

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
    const categoryPath = found.path
      .filter((node) => node.id !== "root")
      .map((node) => node.name);
    for (const file of files) {
      found.node.images.push(await uploadMediaFile(file, selectedId, categoryPath));
    }

    elImgInput.value = "";
    await persistData();
  } catch (error) {
    setStatus(error.message || "Upload failed.", "error");
  }
});

elClearImagesBtn?.addEventListener("click", async () => {
  const found = findNode(data.root, selectedId);
  if (!found) return;

  try {
    const images = found.node.images || [];
    const selected = images
      .map((img, index) => ({ img, key: mediaSelectionKey(img, index) }))
      .filter((item) => selectedMediaKeys.has(item.key));

    if (selected.length === 0) {
      setStatus("Select media to delete first.", "error");
      syncClearMediaButton();
      return;
    }

    const label = selected.length === 1 ? "1 selected media item" : `${selected.length} selected media items`;
    if (!window.confirm(`Delete ${label} from this node?`)) return;

    for (const { img } of selected) {
      await removeStorageObject(storagePathFromMedia(img));
    }

    const selectedKeys = new Set(selected.map((item) => item.key));
    found.node.images = images.filter((img, index) => !selectedKeys.has(mediaSelectionKey(img, index)));
    selectedMediaKeys.clear();
    await persistData();
  } catch (error) {
    setStatus(error.message || "Unable to delete selected media.", "error");
  }
});

onAuthStateChange(() => {
  void refreshAuthState();
});

syncFromRemote(applyRemote);

void refreshAuthState();
