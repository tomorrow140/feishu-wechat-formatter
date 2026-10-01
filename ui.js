const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const surfaceMotions = new Map();

function stopSurfaceMotion(element) {
  const motion = surfaceMotions.get(element);
  if (!motion) return;
  motion.animations.forEach((animation) => animation.cancel());
  motion.overlay?.remove();
  surfaceMotions.delete(element);
}

// Outgoing snapshots live outside the article, so they never enter copied HTML.
function replaceUiContent(element, html, animate = true) {
  if (element.innerHTML === html) return;
  stopSurfaceMotion(element);
  const rect = element.getBoundingClientRect();
  const visible = rect.width && rect.height && rect.bottom > 0 && rect.top < window.innerHeight;
  const shouldAnimate = animate && visible && !reducedMotion.matches && !!element.animate;
  let overlay;
  if (shouldAnimate && element.childNodes.length) {
    overlay = element.cloneNode(true);
    overlay.removeAttribute("id");
    overlay.removeAttribute("role");
    overlay.removeAttribute("aria-live");
    overlay.removeAttribute("contenteditable");
    overlay.querySelectorAll("[id],[aria-live],[contenteditable]").forEach((node) => {
      node.removeAttribute("id");
      node.removeAttribute("aria-live");
      node.removeAttribute("contenteditable");
    });
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    overlay.classList.add("motion-snapshot");
    Object.assign(overlay.style, {
      position: "fixed", left: rect.left + "px", top: rect.top + "px",
      width: rect.width + "px", height: rect.height + "px",
      minHeight: "0", margin: "0", overflow: "hidden",
    });
    document.body.appendChild(overlay);
    overlay.scrollTop = element.scrollTop;
  }
  element.innerHTML = html;
  if (!shouldAnimate) return;
  const animations = [];
  if (overlay) animations.push(overlay.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: 110, easing: "ease-out" },
  ));
  animations.push(element.animate(
    [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 210, easing: "cubic-bezier(.2,.7,.2,1)" },
  ));
  const motion = { overlay, animations };
  surfaceMotions.set(element, motion);
  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    overlay?.remove();
    if (surfaceMotions.get(element) === motion) surfaceMotions.delete(element);
  });
}

const details = document.querySelector(".intro-details");
const detailsSummary = details.querySelector("summary");
let detailsAnimation;
let detailsExpanded = details.open;
detailsSummary.addEventListener("click", (event) => {
  event.preventDefault();
  detailsExpanded = !detailsExpanded;
  const startHeight = details.getBoundingClientRect().height;
  detailsAnimation?.cancel();
  details.style.height = "";
  details.open = detailsExpanded;
  const endHeight = details.getBoundingClientRect().height;
  if (reducedMotion.matches || !details.animate) return;
  details.open = true;
  details.style.overflow = "hidden";
  const animation = details.animate(
    [{ height: startHeight + "px" }, { height: endHeight + "px" }],
    { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" },
  );
  detailsAnimation = animation;
  animation.finished.then(() => {
    if (detailsAnimation !== animation) return;
    details.open = detailsExpanded;
    details.style.overflow = "";
    detailsAnimation = null;
  }).catch(() => {});
});

function stopAllSurfaceMotions() {
  [...surfaceMotions.keys()].forEach(stopSurfaceMotion);
}
window.addEventListener("resize", stopAllSurfaceMotions);
window.addEventListener("scroll", stopAllSurfaceMotions, true);
reducedMotion.addEventListener("change", () => {
  stopAllSurfaceMotions();
  detailsAnimation?.cancel();
  detailsAnimation = null;
  details.open = detailsExpanded;
  details.style.overflow = "";
});
