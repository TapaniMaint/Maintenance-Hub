import {
  DEFAULT_DEPARTMENT_ID,
  LANDING_SNAPSHOT_ITEMS,
  loadData,
  saveData,
  syncFromRemote,
  findNode,
  countDescendants,
  removeNodeById,
  uploadMediaFile,
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
const THEME_KEY = "maintenanceHubTheme_v1";
const THEMES = new Set(["dark", "light", "forest", "steel"]);
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/ogg"]);
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".ogv"];
const ALLOWED_MEDIA_HOSTS = new Set([
  "zaxjhojgxwbldnwempzl.supabase.co",
  "1drv.ms"
]);
const ALLOWED_MEDIA_HOST_SUFFIXES = [
  ".sharepoint.com",
  ".sharepoint-df.com",
  ".onedrive.live.com",
  ".1drv.com"
];

let data = loadData();
let selectedId = data.root.children[0]?.id || "root";
let selectedDepartmentId = data.defaultDepartmentId || DEFAULT_DEPARTMENT_ID;
let expanded = loadExpanded();
let adminEnabled = false;
let selectedMediaKeys = new Set();
let departmentCategoryExpanded = new Set();

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
  if (!currentDepartment()) selectedDepartmentId = data.defaultDepartmentId || DEFAULT_DEPARTMENT_ID;
  renderTree();
}

const treeToggleBtn = document.getElementById("treeToggleBtn");
const overlay = document.getElementById("overlay");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebar = document.getElementById("sidebar");
const collapseTreeBtn = document.getElementById("collapseTreeBtn");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsPanel = document.getElementById("settingsPanel");
const themeModeInputs = [...document.querySelectorAll('input[name="themeMode"]')];
const SIDEBAR_CLOSE_ANIMATION_MS = 220;
let sidebarCloseTimer = 0;

function applyStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (THEMES.has(stored)) {
      document.documentElement.dataset.theme = stored;
    }
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
}

function currentTheme() {
  const theme = document.documentElement.dataset.theme;
  return THEMES.has(theme) ? theme : "dark";
}

function syncThemeToggle() {
  const theme = currentTheme();
  themeModeInputs.forEach((input) => {
    input.checked = input.value === theme;
  });
}

function setAriaExpanded(element, isExpanded) {
  if (!element) return;
  element.setAttribute("aria-expanded", isExpanded ? "true" : "false");
}

function setTheme(theme) {
  const nextTheme = THEMES.has(theme) ? theme : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
  syncThemeToggle();
}

function syncSettingsPanelState() {
  setAriaExpanded(settingsToggleBtn, settingsPanel ? !settingsPanel.hidden : false);
}

function openSettingsPanel() {
  if (!settingsPanel) return;
  settingsPanel.hidden = false;
  syncSettingsPanelState();
}

function closeSettingsPanel() {
  if (!settingsPanel) return;
  settingsPanel.hidden = true;
  syncSettingsPanelState();
}

function toggleSettingsPanel() {
  if (settingsPanel?.hidden) openSettingsPanel();
  else closeSettingsPanel();
}

function isSidebarDrawer() {
  return window.innerWidth <= 980;
}

function syncSidebarState() {
  const isOpen = document.body.classList.contains("sidebar-open");
  const isClosing = document.body.classList.contains("sidebar-closing");
  setAriaExpanded(treeToggleBtn, isOpen);
  sidebar?.setAttribute("aria-hidden", String(!isOpen && isSidebarDrawer()));
  if (overlay) overlay.hidden = !(isOpen || isClosing);
}

function clearSidebarCloseTimer() {
  if (!sidebarCloseTimer) return;
  window.clearTimeout(sidebarCloseTimer);
  sidebarCloseTimer = 0;
}

function finishSidebarClose() {
  document.body.classList.remove("sidebar-closing");
  sidebarCloseTimer = 0;
  syncSidebarState();
}

function openSidebar() {
  clearSidebarCloseTimer();
  document.body.classList.remove("sidebar-closing");
  document.body.classList.add("sidebar-open");
  syncSidebarState();
}

function closeSidebar() {
  const wasOpen = document.body.classList.contains("sidebar-open");
  clearSidebarCloseTimer();
  document.body.classList.remove("sidebar-open");
  if (wasOpen && isSidebarDrawer()) {
    document.body.classList.add("sidebar-closing");
    syncSidebarState();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    sidebarCloseTimer = window.setTimeout(finishSidebarClose, reducedMotion ? 0 : SIDEBAR_CLOSE_ANIMATION_MS);
    return;
  }
  document.body.classList.remove("sidebar-closing");
  syncSidebarState();
}

function toggleSidebar() {
  if (!adminEnabled) return;
  if (document.body.classList.contains("sidebar-open")) closeSidebar();
  else openSidebar();
}

treeToggleBtn?.addEventListener("click", toggleSidebar);
settingsToggleBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSettingsPanel();
});
settingsPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});
themeModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) setTheme(input.value);
  });
});
document.addEventListener("click", closeSettingsPanel);
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
applyStoredTheme();
syncSidebarState();
syncThemeToggle();
syncSettingsPanelState();

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxVideo = document.getElementById("lightboxVideo");
const lightboxCaption = document.getElementById("lightboxCaption");
const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");
let imageZoom = 1;
let imagePanX = 0;
let imagePanY = 0;
let imageDrag = null;
let imagePinch = null;
const imagePointers = new Map();
const desktopImageZoomQuery = window.matchMedia?.("(min-width: 981px) and (pointer: fine)");

function canUseCustomImageZoom() {
  return desktopImageZoomQuery?.matches ?? window.innerWidth > 980;
}

function activeLightboxMedia() {
  return lightboxVideo && !lightboxVideo.hidden ? lightboxVideo : lightboxImg;
}

function isAllowedMediaHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_MEDIA_HOSTS.has(host) || ALLOWED_MEDIA_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function applyImageZoom() {
  const transform = `translate3d(${imagePanX}px, ${imagePanY}px, 0) scale(${imageZoom})`;
  [lightboxImg, lightboxVideo].forEach((media) => {
    if (!media) return;
    media.style.transform = transform;
    media.classList.toggle("zoomed", imageZoom > 1);
  });
}

function resetImageZoom() {
  imageZoom = 1;
  imagePanX = 0;
  imagePanY = 0;
  imageDrag = null;
  imagePinch = null;
  imagePointers.clear();
  applyImageZoom();
}

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerCenter(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function normalizeImageZoom() {
  if (imageZoom <= 1.01) {
    imageZoom = 1;
    imagePanX = 0;
    imagePanY = 0;
  }
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
  document.body.classList.add("lightbox-open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.classList.remove("desktop-zoom");
  lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
  resetImageZoom();
  lightboxImg.src = "";
  lightboxVideo.pause();
  lightboxVideo.removeAttribute("src");
  lightboxVideo.load();
  document.body.style.overflow = "";
}

lightbox?.addEventListener("click", closeLightbox);
lightboxCloseBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeLightbox();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSettingsPanel();
  if (event.key === "Escape" && lightbox?.classList.contains("open")) closeLightbox();
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
  normalizeImageZoom();
  applyImageZoom();
}, { passive: false });
function handleMediaPointerDown(event) {
  event.stopPropagation();
  const media = activeLightboxMedia();
  if (!media || event.currentTarget !== media) return;
  media.setPointerCapture?.(event.pointerId);

  if (event.pointerType === "touch") {
    imagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imagePointers.size === 1 && imageZoom > 1) {
      event.preventDefault();
      imageDrag = { x: event.clientX, y: event.clientY, panX: imagePanX, panY: imagePanY };
    }
    if (imagePointers.size >= 2) {
      event.preventDefault();
      const points = [...imagePointers.values()];
      const center = pointerCenter(points[0], points[1]);
      imagePinch = {
        distance: pointerDistance(points[0], points[1]),
        zoom: imageZoom,
        centerX: center.x,
        centerY: center.y,
        panX: imagePanX,
        panY: imagePanY
      };
      imageDrag = null;
    }
    return;
  }

  if (!canUseCustomImageZoom() || imageZoom <= 1) return;
  event.preventDefault();
  imageDrag = { x: event.clientX, y: event.clientY, panX: imagePanX, panY: imagePanY };
}

function handleMediaPointerMove(event) {
  const media = activeLightboxMedia();
  if (!media || event.currentTarget !== media) return;

  if (event.pointerType === "touch" && imagePointers.has(event.pointerId)) {
    imagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imagePointers.size >= 2 && imagePinch) {
      event.preventDefault();
      const points = [...imagePointers.values()];
      const center = pointerCenter(points[0], points[1]);
      const distance = pointerDistance(points[0], points[1]);
      if (imagePinch.distance < 1) return;
      imageZoom = Math.min(4, Math.max(1, imagePinch.zoom * (distance / imagePinch.distance)));
      imagePanX = imagePinch.panX + center.x - imagePinch.centerX;
      imagePanY = imagePinch.panY + center.y - imagePinch.centerY;
      normalizeImageZoom();
      applyImageZoom();
      return;
    }
  }

  if (!imageDrag) return;
  if (event.pointerType === "touch" || canUseCustomImageZoom()) event.preventDefault();
  imagePanX = imageDrag.panX + event.clientX - imageDrag.x;
  imagePanY = imageDrag.panY + event.clientY - imageDrag.y;
  applyImageZoom();
}

function handleMediaPointerEnd(event) {
  imagePointers.delete(event.pointerId);
  imagePinch = null;
  imageDrag = null;
}

[lightboxImg, lightboxVideo].forEach((media) => {
  media?.addEventListener("pointerdown", handleMediaPointerDown);
  media?.addEventListener("pointermove", handleMediaPointerMove);
  media?.addEventListener("pointerup", handleMediaPointerEnd);
  media?.addEventListener("pointercancel", handleMediaPointerEnd);
});
lightboxVideo?.addEventListener("click", (event) => event.stopPropagation());

function normalizeOneDriveUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  const parsed = new URL(trimmed, window.location.href);
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS media links are allowed.");
  }
  if (!isAllowedMediaHost(parsed.hostname)) {
    throw new Error("Media links must come from an approved storage host.");
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
    if (parsed.protocol === "https:" && isAllowedMediaHost(parsed.hostname)) {
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

function videoThumbnailSrc(src) {
  if (/^(data:|blob:)/i.test(src)) return src;

  try {
    const parsed = new URL(src, window.location.href);
    if (!parsed.hash) parsed.hash = "t=0.001";
    return parsed.href;
  } catch {
    return src;
  }
}

function prepareVideoThumbnail(video, src) {
  video.src = videoThumbnailSrc(src);
  video.controls = false;
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.autoplay = false;
  video.playsInline = true;
  video.preload = "metadata";
  video.load();
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

function showError(error, message) {
  console.warn(message, error);
  setStatus(message, "error");
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
const elDepartmentSelect = document.getElementById("departmentAdminSelect");
const elDepartmentNewName = document.getElementById("departmentNewName");
const elDepartmentName = document.getElementById("departmentNameInput");
const elDepartmentLandingTitle = document.getElementById("departmentLandingTitleInput");
const elDepartmentLandingSubtitle = document.getElementById("departmentLandingSubtitleInput");
const elDepartmentLandingImage = document.getElementById("departmentLandingImageInput");
const elDepartmentSnapshotList = document.getElementById("departmentSnapshotList");
const elDepartmentCategorySearch = document.getElementById("departmentCategorySearch");
const elDepartmentCategoryFilter = document.getElementById("departmentCategoryFilter");
const elDepartmentCategoryCount = document.getElementById("departmentCategoryCount");
const elDepartmentCategoryList = document.getElementById("departmentCategoryList");
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

function countMediaItems(node) {
  let count = (node?.images || []).length;
  for (const child of node?.children || []) {
    count += countMediaItems(child);
  }
  return count;
}

function descendantCategoryIds(node) {
  const ids = [];

  function visit(item) {
    if (!item) return;
    ids.push(item.id);
    for (const child of item.children || []) visit(child);
  }

  visit(node);
  return ids;
}

function assignCategoryToSelectedDepartment(categoryId) {
  const department = currentDepartment();
  if (!department || !categoryId) return;
  department.categoryIds = department.categoryIds || [];
  if (!department.categoryIds.includes(categoryId)) department.categoryIds.push(categoryId);
}

function removeCategoryRefs(categoryIds) {
  const removed = new Set(categoryIds);
  for (const department of data.departments || []) {
    department.categoryIds = (department.categoryIds || []).filter((id) => !removed.has(id));
  }
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

function slugFromName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || `department-${Date.now().toString(36)}`;
}

function currentDepartment() {
  return (data.departments || []).find((department) => department.id === selectedDepartmentId)
    || (data.departments || []).find((department) => department.id === data.defaultDepartmentId)
    || data.departments?.[0]
    || null;
}

function categoryRows(root) {
  const rows = [];

  function visit(node, depth, path) {
    for (const child of node.children || []) {
      const nextPath = [...path, child.name];
      rows.push({ node: child, depth, path: nextPath.join(" / ") });
      visit(child, depth + 1, nextPath);
    }
  }

  visit(root, 0, []);
  return rows;
}

function setDepartmentCategoryChecked(categoryId, checked) {
  const found = findNode(data.root, categoryId);
  const department = currentDepartment();
  if (!found || !department) return;
  const assignedIds = new Set(department.categoryIds || []);

  for (const id of descendantCategoryIds(found.node)) {
    if (checked) assignedIds.add(id);
    else assignedIds.delete(id);
  }

  department.categoryIds = [...assignedIds];
}

function syncDepartmentCategoryStates() {
  if (!elDepartmentCategoryList) return;
  const assignedIds = new Set(currentDepartment()?.categoryIds || []);

  for (const { node } of categoryRows(data.root).reverse()) {
    const input = elDepartmentCategoryList.querySelector(`input[value="${CSS.escape(node.id)}"]`);
    if (!input) continue;

    const childIds = (node.children || []).flatMap((child) => descendantCategoryIds(child));
    if (!childIds.length) {
      input.indeterminate = false;
      input.checked = assignedIds.has(node.id);
      continue;
    }

    const checkedCount = childIds.filter((id) => assignedIds.has(id)).length;
    input.checked = checkedCount === childIds.length && assignedIds.has(node.id);
    input.indeterminate = (checkedCount > 0 && checkedCount < childIds.length) ||
      (checkedCount === childIds.length && !assignedIds.has(node.id));
  }
}

function categoryMatchesDepartmentView(node, query, filter, assignedIds, path = []) {
  const text = [...path, node.name].join(" / ").toLowerCase();
  const searchMatch = !query || text.includes(query);
  const selectedMatch = assignedIds.has(node.id);
  const filterMatch = filter === "selected"
    ? selectedMatch
    : filter === "unselected"
      ? !selectedMatch
      : true;

  return (searchMatch && filterMatch) || (node.children || []).some((child) => (
    categoryMatchesDepartmentView(child, query, filter, assignedIds, [...path, node.name])
  ));
}

function renderDepartmentCategoryNode(node, depth, path, assignedIds, searchQuery, filter) {
  if (!categoryMatchesDepartmentView(node, searchQuery, filter, assignedIds, path)) return;

  const hasChildren = (node.children || []).length > 0;
  const forceExpanded = Boolean(searchQuery) || filter !== "all";
  const isExpanded = forceExpanded || departmentCategoryExpanded.has(node.id);
  const row = document.createElement("div");
  row.className = "department-category-option department-category-option--tree";
  row.style.setProperty("--tree-depth", String(depth));

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "department-category-option__toggle";
  toggle.setAttribute("aria-label", isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`);
  toggle.disabled = !hasChildren;
  toggle.textContent = hasChildren ? (isExpanded ? "v" : ">") : "";
  toggle.addEventListener("click", () => {
    if (departmentCategoryExpanded.has(node.id)) departmentCategoryExpanded.delete(node.id);
    else departmentCategoryExpanded.add(node.id);
    renderDepartmentEditor();
  });

  const label = document.createElement("label");
  label.className = "department-category-option__label";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = node.id;
  input.checked = assignedIds.has(node.id);
  input.addEventListener("change", () => {
    if (hasChildren) setDepartmentCategoryChecked(node.id, input.checked);
    else {
      const department = currentDepartment();
      const nextIds = new Set(department?.categoryIds || []);
      if (input.checked) nextIds.add(node.id);
      else nextIds.delete(node.id);
      if (department) department.categoryIds = [...nextIds];
    }
    renderDepartmentEditor();
  });

  const text = document.createElement("span");
  text.textContent = node.name;

  label.appendChild(input);
  label.appendChild(text);
  row.appendChild(toggle);
  row.appendChild(label);
  elDepartmentCategoryList.appendChild(row);

  if (hasChildren && isExpanded) {
    for (const child of node.children) {
      renderDepartmentCategoryNode(child, depth + 1, [...path, node.name], assignedIds, searchQuery, filter);
    }
  }
}

function renderDepartmentEditor() {
  const departments = data.departments || [];
  const department = currentDepartment();
  if (!department) return;

  if (elDepartmentSelect) {
    elDepartmentSelect.innerHTML = "";
    for (const item of departments) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      elDepartmentSelect.appendChild(option);
    }
    elDepartmentSelect.value = department.id;
  }

  if (elDepartmentName) elDepartmentName.value = department.name || "";
  if (elDepartmentLandingTitle) elDepartmentLandingTitle.value = department.landing?.title || "";
  if (elDepartmentLandingSubtitle) elDepartmentLandingSubtitle.value = department.landing?.subtitle || "";
  if (elDepartmentLandingImage) elDepartmentLandingImage.value = department.landing?.heroImage || "";
  renderDepartmentSnapshotOptions(department);

  if (!elDepartmentCategoryList) return;
  elDepartmentCategoryList.innerHTML = "";
  const assignedIds = new Set(department.categoryIds || []);

  if (elDepartmentCategoryCount) {
    const count = assignedIds.size;
    elDepartmentCategoryCount.textContent = count === 1 ? "1 selected" : `${count} selected`;
  }

  const searchQuery = String(elDepartmentCategorySearch?.value || "").trim().toLowerCase();
  const filter = elDepartmentCategoryFilter?.value || "all";
  for (const child of data.root.children || []) {
    renderDepartmentCategoryNode(child, 0, [], assignedIds, searchQuery, filter);
  }

  syncDepartmentCategoryStates();
}

function renderDepartmentSnapshotOptions(department) {
  if (!elDepartmentSnapshotList) return;

  const selected = new Set(department.snapshotItems || LANDING_SNAPSHOT_ITEMS.map((item) => item.id));
  elDepartmentSnapshotList.innerHTML = "";
  for (const item of LANDING_SNAPSHOT_ITEMS) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");

    input.type = "checkbox";
    input.value = item.id;
    input.checked = selected.has(item.id);
    text.textContent = item.label;

    label.appendChild(input);
    label.appendChild(text);
    elDepartmentSnapshotList.appendChild(label);
  }
}

function applyDepartmentForm(department) {
  department.name = (elDepartmentName?.value || "").trim() || department.name;
  department.landing = {
    title: (elDepartmentLandingTitle?.value || "").trim() || department.name,
    subtitle: (elDepartmentLandingSubtitle?.value || "").trim(),
    heroImage: (elDepartmentLandingImage?.value || "").trim() || "images/Columbia Palisades.jpg"
  };
  department.categoryIds = Array.from(new Set(department.categoryIds || []));
  department.snapshotItems = [...(elDepartmentSnapshotList?.querySelectorAll("input:checked") || [])]
    .map((input) => input.value);
}

function renderTree() {
  if (!adminEnabled) return;

  elTree.innerHTML = "";
  for (const child of data.root.children) renderNodeRow(child, 0);
  renderDepartmentEditor();
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
  if (hasChildren) setAriaExpanded(row, isExpanded);
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
    media.className = "media-lightbox-trigger";
    if (mediaType === "video") {
      prepareVideoThumbnail(media, src);
    } else {
      media.src = src;
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
    setStatus("Changes saved.", "success");
  } catch (error) {
    data = loadData();
    renderTree();
    showError(error, "Unable to save changes.");
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
    setStatus("Sign in with an admin account to load or change data.", "info");
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
  await syncFromRemote(applyRemote);
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
    showError(error, "Sign-in failed.");
  }
});

signOutBtn?.addEventListener("click", async () => {
  try {
    await signOut();
    setAdminEnabledState(false);
    setStatus("Signed out.", "info");
    await refreshAuthState();
  } catch (error) {
    showError(error, "Sign-out failed.");
  }
});

elDepartmentSelect?.addEventListener("change", () => {
  selectedDepartmentId = elDepartmentSelect.value || data.defaultDepartmentId || DEFAULT_DEPARTMENT_ID;
  renderDepartmentEditor();
});

document.getElementById("departmentAddBtn")?.addEventListener("click", async () => {
  const name = (elDepartmentNewName?.value || "").trim();
  if (!name) return;

  const existingIds = new Set((data.departments || []).map((department) => department.id));
  let id = slugFromName(name);
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${slugFromName(name)}-${suffix}`;
    suffix += 1;
  }

  data.departments = data.departments || [];
  data.departments.push({
    id,
    name,
    landing: {
      title: name,
      subtitle: "",
      heroImage: "images/Columbia Palisades.jpg"
    },
    categoryIds: [],
    snapshotItems: LANDING_SNAPSHOT_ITEMS.map((item) => item.id)
  });
  selectedDepartmentId = id;
  if (elDepartmentNewName) elDepartmentNewName.value = "";
  await persistData();
});

document.getElementById("departmentSaveBtn")?.addEventListener("click", async () => {
  const department = currentDepartment();
  if (!department) return;
  const selectedCount = department.categoryIds?.length || 0;
  const message = `Save "${department.name}" with ${selectedCount} visible categories? This changes what users in this department can see.`;
  if (!window.confirm(message)) return;
  applyDepartmentForm(department);
  await persistData();
});

document.getElementById("departmentSelectAllBtn")?.addEventListener("click", () => {
  const department = currentDepartment();
  if (!department) return;

  const allIds = categoryRows(data.root).map(({ node }) => node.id);
  const count = allIds.length;
  const message = `Select all ${count} categories for "${department.name}"? This may expose media from every shared category to this department.`;
  if (!window.confirm(message)) return;

  department.categoryIds = allIds;
  renderDepartmentEditor();
});

document.getElementById("departmentClearAllBtn")?.addEventListener("click", () => {
  const department = currentDepartment();
  if (!department) return;
  const count = department.categoryIds?.length || 0;
  const message = `Clear all visible categories for "${department.name}"? This hides ${count} currently selected categories from this department until changed again.`;
  if (!window.confirm(message)) return;
  department.categoryIds = [];
  renderDepartmentEditor();
});

elDepartmentCategorySearch?.addEventListener("input", renderDepartmentEditor);
elDepartmentCategoryFilter?.addEventListener("change", renderDepartmentEditor);

document.getElementById("departmentExpandAllBtn")?.addEventListener("click", () => {
  departmentCategoryExpanded = new Set(categoryRows(data.root).map(({ node }) => node.id));
  renderDepartmentEditor();
});

document.getElementById("departmentCollapseAllBtn")?.addEventListener("click", () => {
  departmentCategoryExpanded.clear();
  renderDepartmentEditor();
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
    showError(error, "Unable to add the media link.");
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
  assignCategoryToSelectedDepartment(newNode.id);
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
  const newNode = {
    id: `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    name,
    images: [],
    children: []
  };
  found.node.children.push(newNode);
  assignCategoryToSelectedDepartment(newNode.id);

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

    removeNodeById(data.root, selectedId);
    removeCategoryRefs(descendantCategoryIds(found.node));
    selectedId = data.root.children[0]?.id || "root";
    await persistData();
  } catch (error) {
    showError(error, "Unable to delete the selected node.");
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
    showError(error, "Upload failed.");
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

    const selectedKeys = new Set(selected.map((item) => item.key));
    found.node.images = images.filter((img, index) => !selectedKeys.has(mediaSelectionKey(img, index)));
    selectedMediaKeys.clear();
    await persistData();
  } catch (error) {
    showError(error, "Unable to delete selected media.");
  }
});

onAuthStateChange(() => {
  void refreshAuthState();
});

void refreshAuthState();
