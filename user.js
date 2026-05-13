import { loadData, findNode, countDescendants, syncFromRemote } from "./app.js";

const EXPANDED_KEY = "maintenanceHubExpanded_user_v1";

let data = loadData();
let selectedId = data.root.children[0]?.id || "root";
let expanded = loadExpanded(); // collapsed by default

function applyRemote(next) {
  data = next;
  if (!findNode(data.root, selectedId)) {
    selectedId = data.root.children[0]?.id || "root";
  }
  renderAll();
}

// ---------- Sidebar drawer toggle ----------
const treeToggleBtn = document.getElementById("treeToggleBtn");
const overlay = document.getElementById("overlay");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

function closeSidebar() { document.body.classList.remove("sidebar-open"); }
function toggleSidebar() { document.body.classList.toggle("sidebar-open"); }

treeToggleBtn?.addEventListener("click", toggleSidebar);
overlay?.addEventListener("click", closeSidebar);
sidebarCloseBtn?.addEventListener("click", closeSidebar);
window.addEventListener("resize", () => {
  if (window.innerWidth > 720) closeSidebar();
});

// ---------- Lightbox ----------
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

lightbox.addEventListener("click", () => {
  lightbox.classList.remove("open");
  lightboxImg.src = "";
  lightboxVideo.pause();
  lightboxVideo.removeAttribute("src");
  lightboxVideo.load();
  document.body.style.overflow = "";
});
lightboxImg?.addEventListener("click", (event) => event.stopPropagation());
lightboxVideo?.addEventListener("click", (event) => event.stopPropagation());


// ---------- Floating Page Switcher (optional; safe if missing) ----------
const pageFab = document.getElementById("pageFab");
const pageFabBtn = document.getElementById("pageFabBtn");
const pageFabBackdrop = document.getElementById("pageFabBackdrop");
const fabUserLink = document.getElementById("fabUserLink");
const fabAdminLink = document.getElementById("fabAdminLink");

if (pageFab && pageFabBtn && pageFabBackdrop) {
  const path = location.pathname.toLowerCase();
const isAdminPage = path === "/admin" || path.endsWith("/admin/") || path.endsWith("/admin.html");

if (isAdminPage) {
  fabAdminLink && (fabAdminLink.style.opacity = "0.55");
  fabAdminLink && (fabAdminLink.style.pointerEvents = "none");
} else {
  fabUserLink && (fabUserLink.style.opacity = "0.55");
  fabUserLink && (fabUserLink.style.pointerEvents = "none");
}



  function closeFab() { pageFab.classList.remove("open"); }
  function toggleFab() { pageFab.classList.toggle("open"); }

  pageFabBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFab();
  });

  pageFabBackdrop.addEventListener("click", () => closeFab());

  document.addEventListener("click", (e) => {
    if (!pageFab.contains(e.target)) closeFab();
  });

  fabUserLink?.addEventListener("click", closeFab);
  fabAdminLink?.addEventListener("click", closeFab);
}

const elTree = document.getElementById("tree");
const elUpdatedAt = document.getElementById("updatedAt");
const elGallery = document.getElementById("gallery");
const elImgHint = document.getElementById("imgHint");

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

function renderSidebarTree() {
  if (!elTree) return;

  elTree.innerHTML = "";
  fmtUpdated();

  for (const child of data.root.children) {
    renderNodeRow(child, 0);
  }
}

function renderNodeRow(node, depth) {
  const row = document.createElement("div");
  row.className = "tree-item" + (node.id === selectedId ? " selected" : "");
  row.style.marginLeft = (depth * 12) + "px";
  row.dataset.depth = String(depth);
  if (depth > 0) row.classList.add(`depth-${Math.min(depth, 6)}`);

  const left = document.createElement("div");
  left.className = "left";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = node.name;

  const meta = document.createElement("div");
  meta.className = "meta";
  // meta.textContent = `${(node.children || []).length} child`;

  left.appendChild(name);
  left.appendChild(meta);

  const right = document.createElement("div");
  // right.className = "badge";
  // right.textContent = `${countDescendants(node)} under`;

  row.appendChild(left);
  row.appendChild(right);

  // click row: select + toggle expand/collapse 
  row.addEventListener("click", () => {
    selectedId = node.id;

    if ((node.children || []).length > 0) {
      if (expanded.has(node.id)) expanded.delete(node.id);
      else expanded.add(node.id);
      saveExpanded();
    }

    renderAll();
  });

  elTree.appendChild(row);

  if ((node.children || []).length > 0 && expanded.has(node.id)) {
    for (const c of node.children) renderNodeRow(c, depth + 1);
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
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
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

function renderImagesOnly() {
  if (!elGallery) return;

  const found = findNode(data.root, selectedId);
  if (!found) return;

  const node = found.node;

  elGallery.innerHTML = "";
  const imgs = node.images || [];

  if (elImgHint) {
    elImgHint.textContent = imgs.length ? "" : "No media on this category.";
  }

  imgs.forEach((img) => {
    const card = document.createElement("div");
    card.className = "card";

    const src = safeMediaUrl(img.url || img.dataUrl || "");
    if (!src) return;
    const mediaType = mediaTypeFor(img, src);
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
    media.addEventListener("click", () => {
      openLightbox(src, img.name || "", mediaType);
    });



    const cap = document.createElement("div");
    cap.className = "cap";
    const label = document.createElement("span");
    label.textContent = img.name || mediaType;
    const spacer = document.createElement("span");
    cap.appendChild(label);
    cap.appendChild(spacer);

    card.appendChild(media);
    card.appendChild(cap);
    elGallery.appendChild(card);
  });
}

function renderAll() {
  data = loadData();
  renderSidebarTree();
  renderImagesOnly();
}

syncFromRemote(applyRemote);
setInterval(() => syncFromRemote(applyRemote), 15000);

renderAll();
