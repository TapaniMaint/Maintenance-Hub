(() => {
  const img = document.getElementById("lightboxImg");
  const lightbox = document.getElementById("lightbox");
  if (!img || !lightbox) return;

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let drag = null;
  let pinch = null;
  const pointers = new Map();

  const apply = () => {
    img.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
  };

  const reset = () => {
    zoom = 1;
    panX = 0;
    panY = 0;
    drag = null;
    pinch = null;
    pointers.clear();
    apply();
  };

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const center = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const normalize = () => {
    if (zoom <= 1.01) {
      zoom = 1;
      panX = 0;
      panY = 0;
    }
  };

  img.addEventListener("click", (event) => event.stopPropagation());
  img.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    img.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && zoom > 1) {
      event.preventDefault();
      drag = { x: event.clientX, y: event.clientY, panX, panY };
    }
    if (pointers.size >= 2) {
      event.preventDefault();
      const points = [...pointers.values()];
      const midpoint = center(points[0], points[1]);
      pinch = { distance: distance(points[0], points[1]), zoom, x: midpoint.x, y: midpoint.y, panX, panY };
      drag = null;
    }
  });

  img.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinch) {
      event.preventDefault();
      if (pinch.distance < 1) return;
      const points = [...pointers.values()];
      const midpoint = center(points[0], points[1]);
      zoom = Math.min(4, Math.max(1, pinch.zoom * (distance(points[0], points[1]) / pinch.distance)));
      panX = pinch.panX + midpoint.x - pinch.x;
      panY = pinch.panY + midpoint.y - pinch.y;
      normalize();
      apply();
      return;
    }
    if (!drag) return;
    event.preventDefault();
    panX = drag.panX + event.clientX - drag.x;
    panY = drag.panY + event.clientY - drag.y;
    apply();
  });

  const end = (event) => {
    pointers.delete(event.pointerId);
    pinch = null;
    drag = null;
  };
  img.addEventListener("pointerup", end);
  img.addEventListener("pointercancel", end);

  new MutationObserver(() => {
    if (!lightbox.classList.contains("open")) reset();
  }).observe(lightbox, { attributes: true, attributeFilter: ["class"] });
})();
