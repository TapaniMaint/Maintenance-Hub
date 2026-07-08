import { DEFAULT_DEPARTMENT_ID, LANDING_SNAPSHOT_ITEMS, loadData, findNode, syncFromRemote } from "./app.js";
import { getUser, onAuthStateChange, signOut } from "./supabase-client.js";

const EXPANDED_KEY = "maintenanceHubExpanded_user_v1";
const THEME_KEY = "maintenanceHubTheme_v1";
const DEPARTMENT_KEY = "maintenanceHubDepartment_user_v1";
const THEMES = new Set(["dark", "light", "forest", "steel"]);
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
const DEPARTMENT_PAGES = new Map([
  ["mechanics", "mechanics.html"],
  ["crew-truck", "crew-truck.html"],
  ["maintenance-tech", "maintenance-tech.html"],
  ["tapani-trucking", "tapani-trucking.html"]
]);

let data = loadData();
let activeDepartmentId = readDepartmentId();
let selectedId = "";
let expanded = loadExpanded();
let hasBrowsedMedia = false;
let showingHomePage = !hasDepartmentRoute();

function applyRemote(next) {
  data = next;
  if (!activeDepartment()) activeDepartmentId = data.defaultDepartmentId || DEFAULT_DEPARTMENT_ID;
  if (!isCategoryVisible(selectedId)) {
    selectedId = "";
    hasBrowsedMedia = false;
  }
  renderAll();
}

const treeToggleBtn = document.getElementById("treeToggleBtn");
const userSignOutBtn = document.getElementById("userSignOutBtn");
const overlay = document.getElementById("overlay");
const sidebar = document.getElementById("sidebar");
const collapseTreeBtn = document.getElementById("collapseTreeBtn");
const homeBtn = document.getElementById("homeBtn");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsPanel = document.getElementById("settingsPanel");
const themeModeInputs = [...document.querySelectorAll('input[name="themeMode"]')];
const SIDEBAR_CLOSE_ANIMATION_MS = 220;
const SIDEBAR_FLASH_MS = 900;
let sidebarCloseTimer = 0;
let sidebarFlashTimer = 0;

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

function moveFocusOutOfHiddenSidebar() {
  if (!sidebar?.contains(document.activeElement)) return;
  treeToggleBtn?.focus({ preventScroll: true });
}

function syncSidebarState() {
  if (showingHomePage) {
    document.body.classList.remove("sidebar-open", "sidebar-closing");
    setAriaExpanded(treeToggleBtn, false);
    if (treeToggleBtn) {
      treeToggleBtn.hidden = true;
      treeToggleBtn.textContent = "Menu";
      treeToggleBtn.setAttribute("aria-label", "Open menu");
    }
    sidebar?.setAttribute("aria-hidden", "true");
    sidebar?.toggleAttribute("inert", true);
    if (overlay) overlay.hidden = true;
    return;
  }

  if (treeToggleBtn) treeToggleBtn.hidden = false;
  const isOpen = document.body.classList.contains("sidebar-open");
  const isClosing = document.body.classList.contains("sidebar-closing");
  const hideDrawerSidebar = !isOpen && isSidebarDrawer();
  if (hideDrawerSidebar) moveFocusOutOfHiddenSidebar();
  setAriaExpanded(treeToggleBtn, isOpen);
  if (treeToggleBtn) {
    treeToggleBtn.textContent = isOpen ? "Close" : "Menu";
    treeToggleBtn.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  }
  sidebar?.setAttribute("aria-hidden", String(hideDrawerSidebar));
  sidebar?.toggleAttribute("inert", hideDrawerSidebar);
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
  if (document.body.classList.contains("sidebar-open")) closeSidebar();
  else openSidebar();
}

function flashSidebar() {
  if (!sidebar) return;
  if (sidebarFlashTimer) window.clearTimeout(sidebarFlashTimer);
  sidebar.classList.remove("sidebar-flash");
  void sidebar.offsetWidth;
  sidebar.classList.add("sidebar-flash");
  sidebarFlashTimer = window.setTimeout(() => {
    sidebar.classList.remove("sidebar-flash");
    sidebarFlashTimer = 0;
  }, SIDEBAR_FLASH_MS);
}

function showLandingPage() {
  showingHomePage = true;
  selectedId = "";
  hasBrowsedMedia = false;
  closeSidebar();
  closeSettingsPanel();
  renderAll();
  document.querySelector(".portal-content, .content")?.scrollTo({ top: 0, behavior: "smooth" });
}

homeBtn?.addEventListener("click", (event) => {
  if (pageDepartmentId()) return;
  event.preventDefault();
  showLandingPage();
});
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
collapseTreeBtn?.addEventListener("click", () => {
  expanded.clear();
  if (elCategorySearch) elCategorySearch.value = "";
  saveExpanded();
  renderAll();
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

const elTree = document.getElementById("tree");
const elUpdatedAt = document.getElementById("updatedAt");
const elGallery = document.getElementById("gallery");
const elHomePage = document.getElementById("homePage");
const elHomeDepartmentList = document.getElementById("homeDepartmentList");
const elImgHint = document.getElementById("imgHint");
const elCategorySearch = document.getElementById("categorySearch");
const elLandingHero = document.getElementById("landingHero");
const elLandingFutureSpace = document.getElementById("landingFutureSpace");
const landingBrowseBtn = document.getElementById("landingBrowseBtn");
const elMediaTitle = document.getElementById("mediaTitle");
const departmentSelect = document.getElementById("departmentSelect");
const elStatsSection = document.querySelector("[aria-labelledby='statsTitle']");

function readDepartmentId() {
  const param = new URLSearchParams(window.location.search).get("department");
  if (param) return param;
  const pageDepartment = pageDepartmentId();
  if (pageDepartment) return pageDepartment;

  try {
    return localStorage.getItem(DEPARTMENT_KEY) || DEFAULT_DEPARTMENT_ID;
  } catch {
    return DEFAULT_DEPARTMENT_ID;
  }
}

function hasDepartmentRoute() {
  return new URLSearchParams(window.location.search).has("department") || !!pageDepartmentId();
}

function pageDepartmentId() {
  return document.body?.dataset.departmentId || "";
}

function departmentHref(id) {
  return DEPARTMENT_PAGES.get(id) || `/?department=${encodeURIComponent(id)}`;
}

function saveDepartmentId(id) {
  try {
    localStorage.setItem(DEPARTMENT_KEY, id);
  } catch {
  }
}

function activeDepartment() {
  return (data.departments || []).find((department) => department.id === activeDepartmentId)
    || (data.departments || []).find((department) => department.id === data.defaultDepartmentId)
    || data.departments?.[0]
    || null;
}

function departmentCategoryIds() {
  return new Set(activeDepartment()?.categoryIds || []);
}

function hasVisibleDescendant(node, visibleIds) {
  return (node.children || []).some((child) => visibleIds.has(child.id) || hasVisibleDescendant(child, visibleIds));
}

function isCategoryVisible(id) {
  if (!id) return true;
  return departmentCategoryIds().has(id);
}

function shouldRenderNode(node, visibleIds) {
  return visibleIds.has(node.id) || hasVisibleDescendant(node, visibleIds);
}

function renderDepartmentPicker() {
  if (!departmentSelect) return;

  const departments = data.departments || [];
  departmentSelect.innerHTML = "";
  for (const department of departments) {
    const option = document.createElement("option");
    option.value = department.id;
    option.textContent = department.name;
    departmentSelect.appendChild(option);
  }

  if (!departments.some((department) => department.id === activeDepartmentId)) {
    activeDepartmentId = data.defaultDepartmentId || departments[0]?.id || DEFAULT_DEPARTMENT_ID;
  }

  departmentSelect.value = activeDepartmentId;
}

function syncDepartmentUrl() {
  if (pageDepartmentId()) return;
  const url = new URL(window.location.href);
  url.searchParams.set("department", activeDepartmentId);
  window.history.replaceState({}, "", url);
}

function applyDepartmentLanding() {
  const department = activeDepartment();
  const landing = department?.landing || {};
  const title = landing.title || department?.name || "Service Portal";
  const subtitle = landing.subtitle || "Equipment service guide";
  const titleEl = document.getElementById("landingTitle");
  const subtitleEl = elLandingHero?.querySelector(".hero__content p");
  const imageEl = elLandingHero?.querySelector(".hero__image");

  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (imageEl) imageEl.alt = `${title} landing image`;
  applyDepartmentSnapshot(department);
}

function applyDepartmentSnapshot(department) {
  const defaultItems = LANDING_SNAPSHOT_ITEMS.map((item) => item.id);
  const visibleItems = new Set(Array.isArray(department?.snapshotItems) ? department.snapshotItems : defaultItems);
  let visibleCount = 0;

  document.querySelectorAll("[data-snapshot-item]").forEach((tile) => {
    const visible = visibleItems.has(tile.dataset.snapshotItem);
    tile.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  if (elStatsSection) elStatsSection.hidden = visibleCount === 0;
}

function openDepartmentHome(departmentId) {
  activeDepartmentId = departmentId || DEFAULT_DEPARTMENT_ID;
  saveDepartmentId(activeDepartmentId);
  syncDepartmentUrl();
  showingHomePage = false;
  selectedId = "";
  hasBrowsedMedia = false;
  if (elCategorySearch) elCategorySearch.value = "";
  renderAll();
  document.querySelector(".portal-content, .content")?.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHomePage() {
  if (!elHomeDepartmentList) return;

  elHomeDepartmentList.innerHTML = "";
  for (const department of data.departments || []) {
    const button = document.createElement("a");
    button.href = departmentHref(department.id);
    button.className = "home-department-card";

    const title = document.createElement("strong");
    title.textContent = department.name;

    const subtitle = document.createElement("span");
    subtitle.textContent = department.landing?.subtitle || "Open department resources.";

    const count = document.createElement("small");
    const categoryCount = department.categoryIds?.length || 0;
    count.textContent = categoryCount === 1 ? "1 category" : `${categoryCount} categories`;

    button.appendChild(title);
    button.appendChild(subtitle);
    button.appendChild(count);
    elHomeDepartmentList.appendChild(button);
  }
}

function loadExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveExpanded() {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
}

function fmtUpdated() {
  if (!elUpdatedAt) return;
  elUpdatedAt.textContent = new Date(data.updatedAt).toLocaleString();
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function nodeMatchesSearch(node, query) {
  if (!query) return true;
  if (nodeNameMatchesSearch(node, query)) return true;
  return (node.children || []).some((child) => nodeMatchesSearch(child, query));
}

function nodeNameMatchesSearch(node, query) {
  return normalizeSearch(node.name).includes(query);
}

function renderSidebarTree() {
  if (!elTree) return;

  elTree.innerHTML = "";
  fmtUpdated();

  const searchQuery = normalizeSearch(elCategorySearch?.value);
  const visibleIds = departmentCategoryIds();
  let visibleCount = 0;
  for (const child of data.root.children) {
    if (!shouldRenderNode(child, visibleIds)) continue;
    if (!nodeMatchesSearch(child, searchQuery)) continue;
    visibleCount += 1;
    renderNodeRow(child, 0, searchQuery, false, visibleIds);
  }

  if (searchQuery && visibleCount === 0) {
    const empty = document.createElement("div");
    empty.className = "tree-empty category-tree__empty";
    empty.textContent = "No matching categories.";
    elTree.appendChild(empty);
  } else if (!searchQuery && visibleCount === 0) {
    const empty = document.createElement("div");
    empty.className = "tree-empty category-tree__empty";
    empty.textContent = "No categories assigned to this department.";
    elTree.appendChild(empty);
  }
}

function renderNodeRow(node, depth, searchQuery = "", revealSearchSubtree = false, visibleIds = departmentCategoryIds()) {
  const row = document.createElement("button");
  const hasChildren = (node.children || []).length > 0;
  const directSearchMatch = searchQuery && nodeNameMatchesSearch(node, searchQuery);
  const descendantSearchMatch = searchQuery && (node.children || []).some((child) => nodeMatchesSearch(child, searchQuery));
  const shouldRevealSearchSubtree = revealSearchSubtree || directSearchMatch;
  const shouldForceOpenForSearch = searchQuery && !directSearchMatch && descendantSearchMatch;
  const isExpanded = hasChildren && (expanded.has(node.id) || shouldForceOpenForSearch);
  row.type = "button";
  row.className = "tree-item category-tree__item" + (node.id === selectedId ? " selected category-tree__item--selected" : "");
  row.style.setProperty("--tree-depth", String(depth));
  row.dataset.depth = String(depth);
  row.setAttribute("aria-current", node.id === selectedId ? "true" : "false");
  if (hasChildren) setAriaExpanded(row, isExpanded);
  if (depth > 0) row.classList.add(`depth-${Math.min(depth, 6)}`, `category-tree__item--depth-${Math.min(depth, 6)}`);
  if (!visibleIds.has(node.id)) {
    row.classList.add("category-tree__item--ancestor-only");
  }

  const left = document.createElement("div");
  left.className = "left category-tree__item-content";

  const toggleIndicator = document.createElement("span");
  toggleIndicator.className = "tree-toggle-indicator category-tree__toggle";
  toggleIndicator.setAttribute("aria-hidden", "true");
  if (hasChildren && isExpanded) toggleIndicator.classList.add("expanded", "category-tree__toggle--expanded");
  if (!hasChildren) toggleIndicator.classList.add("leaf", "category-tree__toggle--leaf");

  const name = document.createElement("div");
  name.className = "name category-tree__name";
  name.textContent = node.name;

  const meta = document.createElement("div");
  meta.className = "meta category-tree__meta";

  left.appendChild(toggleIndicator);
  left.appendChild(name);
  left.appendChild(meta);
  row.appendChild(left);
  const spacer = document.createElement("span");
  spacer.setAttribute("aria-hidden", "true");
  row.appendChild(spacer);

  row.addEventListener("click", () => {
    if (visibleIds.has(node.id)) {
      selectedId = node.id;
      hasBrowsedMedia = true;
    }

    if (hasChildren) {
      if (expanded.has(node.id)) expanded.delete(node.id);
      else expanded.add(node.id);
      saveExpanded();
    }

    renderAll();
    if (visibleIds.has(node.id) && !hasChildren && isSidebarDrawer()) closeSidebar();
  });

  elTree.appendChild(row);

  if (hasChildren && isExpanded) {
    for (const child of node.children) {
      if (!shouldRenderNode(child, visibleIds)) continue;
      if (searchQuery && !shouldRevealSearchSubtree && !nodeMatchesSearch(child, searchQuery)) continue;
      renderNodeRow(child, depth + 1, searchQuery, shouldRevealSearchSubtree, visibleIds);
    }
  }
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

function renderImagesOnly() {
  if (!elGallery) return;

  const found = findNode(data.root, selectedId);
  const showHome = showingHomePage;
  const showLanding = !showHome && (!hasBrowsedMedia || !found || !isCategoryVisible(selectedId));
  applyDepartmentLanding();
  renderHomePage();

  document.body.classList.toggle("home-visible", showHome);
  syncSidebarState();
  if (homeBtn) homeBtn.hidden = showHome;
  if (elHomePage) elHomePage.hidden = !showHome;
  if (elLandingHero) elLandingHero.hidden = !showLanding;
  if (elLandingFutureSpace) elLandingFutureSpace.hidden = !showLanding;
  elGallery.hidden = showHome || showLanding;
  if (elImgHint) elImgHint.hidden = showHome || showLanding;
  if (elMediaTitle) {
    elMediaTitle.hidden = showHome || showLanding;
    elMediaTitle.textContent = showHome || showLanding ? "" : found.node.name;
  }
  if (showHome || showLanding) {
    elGallery.innerHTML = "";
    if (elImgHint) elImgHint.textContent = "";
    return;
  }

  const node = found.node;
  const imgs = node.images || [];

  elGallery.innerHTML = "";

  if (elImgHint) {
    elImgHint.textContent = imgs.length ? "" : "No media on this category.";
  }

  for (const img of imgs) {
    const src = safeMediaUrl(img.url || img.dataUrl || "");
    if (!src) continue;
    const mediaType = mediaTypeFor(img, src);

    const card = document.createElement("div");
    card.className = "card media-card";
    if (mediaType === "video") card.classList.add("card-video", "media-card--video");

    const media = mediaType === "video" ? document.createElement("video") : document.createElement("img");
    media.className = "media-lightbox-trigger media-card__preview";
    if (mediaType === "video") {
      prepareVideoThumbnail(media, src);
    } else {
      media.src = src;
      media.alt = img.name || "image";
    }
    media.addEventListener("click", () => openLightbox(src, img.name || "", mediaType));

    if (mediaType === "video") {
      const badge = document.createElement("div");
      badge.className = "video-badge media-card__type-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "VIDEO";
      card.appendChild(badge);
    }

    const cap = document.createElement("div");
    cap.className = "cap media-card__caption";

    const label = document.createElement("span");
    label.className = "media-label media-card__label";
    label.textContent = img.name || mediaType;

    const spacer = document.createElement("span");
    spacer.setAttribute("aria-hidden", "true");

    cap.appendChild(label);
    cap.appendChild(spacer);
    card.appendChild(media);
    card.appendChild(cap);
    elGallery.appendChild(card);
  }
}

function renderAll() {
  data = loadData();
  renderDepartmentPicker();
  renderSidebarTree();
  renderImagesOnly();
}

function redirectToLogin() {
  window.location.assign("/login.html");
}

elCategorySearch?.addEventListener("input", renderSidebarTree);
departmentSelect?.addEventListener("change", () => {
  activeDepartmentId = departmentSelect.value || DEFAULT_DEPARTMENT_ID;
  saveDepartmentId(activeDepartmentId);
  if (pageDepartmentId()) {
    window.location.assign(departmentHref(activeDepartmentId));
    return;
  }
  syncDepartmentUrl();
  showingHomePage = false;
  selectedId = "";
  hasBrowsedMedia = false;
  if (elCategorySearch) elCategorySearch.value = "";
  renderAll();
});
landingBrowseBtn?.addEventListener("click", () => {
  showingHomePage = false;
  if (isSidebarDrawer()) openSidebar();
  window.setTimeout(() => {
    flashSidebar();
    elCategorySearch?.focus();
    sidebar?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, 80);
});

userSignOutBtn?.addEventListener("click", async () => {
  userSignOutBtn.disabled = true;
  try {
    await signOut();
    redirectToLogin();
  } catch (error) {
    console.warn("Unable to sign out.", error);
    userSignOutBtn.disabled = false;
  }
});

onAuthStateChange((session) => {
  if (!session?.user) redirectToLogin();
});

async function startUserPortal() {
  try {
    const user = await getUser();
    if (!user) {
      redirectToLogin();
      return;
    }

    if (userSignOutBtn) userSignOutBtn.hidden = false;
    document.body.classList.remove("auth-checking");
    renderAll();
    await syncFromRemote(applyRemote);
  } catch (error) {
    console.warn("Unable to verify user session.", error);
    redirectToLogin();
  }
}

startUserPortal();
