import { loadData, findNode, syncFromRemote } from "./app.js";

const EXPANDED_KEY = "maintenanceHubExpanded_user_v1";

let data = loadData();
let selectedId = data.root.children[0]?.id || "root";
let expanded = loadExpanded();

function applyRemote(next) {
  data = next;
  if (!findNode(data.root, selectedId)) {
    selectedId = data.root.children[0]?.id || "root";
  }
  renderAll();
}

const treeToggleBtn = document.getElementById("treeToggleBtn");
const overlay = document.getElementById("overlay");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function toggleSidebar() {
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
const lightboxCaption = document.getElementById("lightboxCaption");

function openLightbox(src, caption = "") {
  lightboxImg.src = src;
  lightboxCaption.textContent = caption;
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
}

lightbox?.addEventListener("click", () => {
  lightbox.classList.remove("open");
  lightboxImg.src = "";
  document.body.style.overflow = "";
});

const pageFab = document.getElementById("pageFab");
const pageFabBtn = document.getElementById("pageFabBtn");
const pageFabBackdrop = document.getElementById("pageFabBackdrop");
const fabUserLink = document.getElementById("fabUserLink");

if (pageFab && pageFabBtn && pageFabBackdrop && fabUserLink) {
  fabUserLink.style.opacity = "0.55";
  fabUserLink.style.pointerEvents = "none";

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
  row.style.marginLeft = `${depth * 12}px`;
  row.dataset.depth = String(depth);
  if (depth > 0) row.classList.add(`depth-${Math.min(depth, 6)}`);

  const left = document.createElement("div");
  left.className = "left";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = node.name;

  const meta = document.createElement("div");
  meta.className = "meta";

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

    renderAll();
  });

  elTree.appendChild(row);

  if ((node.children || []).length > 0 && expanded.has(node.id)) {
    for (const child of node.children) renderNodeRow(child, depth + 1);
  }
}

function safeImageUrl(value) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) return trimmed;
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

function renderImagesOnly() {
  if (!elGallery) return;

  const found = findNode(data.root, selectedId);
  if (!found) return;

  const node = found.node;
  const imgs = node.images || [];

  elGallery.innerHTML = "";

  if (elImgHint) {
    elImgHint.textContent = imgs.length ? "" : "No images on this category.";
  }

  for (const img of imgs) {
    const src = safeImageUrl(img.url || img.dataUrl || "");
    if (!src) continue;

    const card = document.createElement("div");
    card.className = "card";

    const image = document.createElement("img");
    image.src = src;
    image.alt = img.name || "image";
    image.style.cursor = "zoom-in";
    image.addEventListener("click", () => openLightbox(src, img.name || ""));

    const cap = document.createElement("div");
    cap.className = "cap";

    const label = document.createElement("span");
    label.textContent = img.name || "image";

    const spacer = document.createElement("span");
    spacer.setAttribute("aria-hidden", "true");

    cap.appendChild(label);
    cap.appendChild(spacer);
    card.appendChild(image);
    card.appendChild(cap);
    elGallery.appendChild(card);
  }
}

function renderAll() {
  data = loadData();
  renderSidebarTree();
  renderImagesOnly();
}

syncFromRemote(applyRemote);
setInterval(() => syncFromRemote(applyRemote), 15000);

renderAll();
