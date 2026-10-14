/* Systems for Mission: progressive navigation, folders and local HTML previews. */
(() => {
  "use strict";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const desktopHover = matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  const desktopNav = matchMedia("(min-width: 960px)");
  const setMenu = open => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setMenu(open);
    if (open) nav.querySelector("a").focus();
  });
  nav.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link) return;
    setMenu(false);
    if (link.hash && link.pathname === location.pathname) {
      const destination = document.querySelector(link.hash);
      if (destination) {
        destination.tabIndex = -1;
        destination.focus({ preventScroll: true });
      }
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setMenu(false);
      toggle.focus();
    }
  });
  document.addEventListener("click", event => { if (!header.contains(event.target)) setMenu(false); });
  // iOS Safari drops focus from the menu before it delivers a tap on a link. Closing on
  // that focusout hid the link mid-tap, so menu links never fired. Ignore focus changes
  // while a pointer is pressed inside the header, and let the click itself close the menu.
  let pointerInHeader = false;
  header.addEventListener("pointerdown", () => { pointerInHeader = true; });
  document.addEventListener("pointerup", () => { setTimeout(() => { pointerInHeader = false; }, 400); }, true);
  header.addEventListener("focusout", event => {
    if (pointerInHeader) return;
    if (!header.contains(event.relatedTarget)) setMenu(false);
  });
  desktopNav.addEventListener("change", () => {
    if (!desktopNav.matches && nav.contains(document.activeElement)) toggle.focus();
    setMenu(false);
  });

  // Reading zone: the middle band of the screen. Elements open the first time they
  // reach it and then stay open.
  const canObserve = "IntersectionObserver" in window;
  // The observed area reaches far above the screen, so anything already scrolled
  // past (even during a fast flick) also counts as seen.
  const watchZone = (elements, onEnter, line = "-30%") => {
    if (!canObserve) return;
    const zone = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        onEnter(entry.target);
        zone.unobserve(entry.target);
      });
    }, { rootMargin: `100000px 0px ${line} 0px`, threshold: 0 });
    elements.forEach(el => zone.observe(el));
  };

  const folders = document.querySelector(".folders");
  const resetFolders = [];
  const closeFolders = [];
  const zoneFolders = new Map();
  document.querySelectorAll(".folder").forEach(folder => {
    const button = folder.querySelector(".folder-toggle");
    const description = folder.querySelector(".folder-desc");
    let pinned = false, hovered = false, focused = false, dismissed = false, inZone = false, hideTimer;
    const render = () => {
      const open = reduceMotion.matches || pinned ||
        (!dismissed && (inZone || (desktopHover.matches && (hovered || focused))));
      if (open === folder.classList.contains("is-open") && description.hidden === !open) return;
      button.setAttribute("aria-expanded", String(open));
      clearTimeout(hideTimer);
      if (open) {
        // Unhide first, then open on the next frame so the height can animate
        description.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => folder.classList.add("is-open")));
      } else {
        folder.classList.remove("is-open");
        // Hide from assistive tech only after the closing animation has finished
        hideTimer = setTimeout(() => { if (!folder.classList.contains("is-open")) description.hidden = true; }, 480);
      }
    };
    zoneFolders.set(folder, () => { inZone = true; render(); });
    button.addEventListener("click", () => {
      const wasOpen = button.getAttribute("aria-expanded") === "true";
      pinned = !wasOpen;
      dismissed = wasOpen;
      // Touch layouts: one open folder at a time keeps the list light
      if (pinned && !desktopHover.matches) closeFolders.forEach(close => close(folder));
      render();
    });
    closeFolders.push(except => { if (except !== folder && pinned) { pinned = false; render(); } });
    folder.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      hovered = true; dismissed = false; render();
    });
    folder.addEventListener("pointerleave", () => { hovered = false; render(); });
    folder.addEventListener("focusin", () => { focused = true; dismissed = false; render(); });
    folder.addEventListener("focusout", event => {
      if (!folder.contains(event.relatedTarget)) { focused = false; dismissed = false; render(); }
    });
    folder.addEventListener("keydown", event => {
      if (event.key === "Escape") { pinned = false; dismissed = true; render(); }
    });
    resetFolders.push(() => { hovered = false; focused = folder.contains(document.activeElement); render(); });
    description.hidden = true;
    render();
  });
  document.documentElement.classList.add("enhanced");
  // Files open as they reach the middle of the screen, then stay open
  watchZone(Array.from(zoneFolders.keys()), folder => zoneFolders.get(folder)());

  // Reserve the tallest expanded height on desktop; opening never moves adjacent content.
  function measureFolders() {
    folders.style.removeProperty("--folder-h");
    if (!desktopHover.matches) return;
    folders.classList.add("is-measuring");
    const height = Math.max(...Array.from(folders.querySelectorAll(".folder-front"), item => item.offsetHeight));
    folders.classList.remove("is-measuring");
    folders.style.setProperty("--folder-h", `${height}px`);
  }
  new ResizeObserver(measureFolders).observe(folders);
  desktopHover.addEventListener("change", () => { resetFolders.forEach(reset => reset()); measureFolders(); });
  document.fonts.ready.then(measureFolders);
  measureFolders();

  // A short, one-time alignment movement. Content and logos remain fully opaque.
  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    folders.classList.add("is-filing");
    const filing = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        folders.classList.remove("is-filing");
        filing.disconnect();
      }
    }, { threshold: 0, rootMargin: "0px 0px -60px 0px" });
    filing.observe(folders);
    reduceMotion.addEventListener("change", () => {
      if (reduceMotion.matches) { folders.classList.remove("is-filing"); filing.disconnect(); }
    });
  }

  // The local exports have fixed table columns. Measure their real content, never a crop.
  const dimensions = document => {
    const sheet = document.querySelector(".ritz");
    if (!sheet) return null;
    return { width: Math.ceil(sheet.getBoundingClientRect().width + 16), height: Math.ceil(sheet.getBoundingClientRect().height + 16) };
  };
  document.querySelectorAll(".system-preview").forEach(preview => {
    const frame = preview.querySelector("iframe");
    const area = preview.querySelector(".system-overview");
    let size;
    const fit = () => {
      if (!size) return;
      const bounds = area.getBoundingClientRect();
      const scale = Math.min((bounds.width - 1) / size.width, (bounds.height - 1) / size.height);
      frame.style.width = `${size.width}px`;
      frame.style.height = `${size.height}px`;
      frame.style.transform = `scale(${scale})`;
      // Center the entire sheet in a reserved frame without changing surrounding layout.
      frame.style.left = `${(area.clientWidth - size.width * scale) / 2}px`;
      frame.style.top = `${(area.clientHeight - size.height * scale) / 2}px`;
    };
    const measure = () => {
      try {
        size = dimensions(frame.contentDocument);
        if (size) { fit(); preview.classList.add("is-ready"); }
      } catch (_) { /* Local-file restrictions: retain the working full-preview link. */ }
    };
    frame.addEventListener("load", () => {
      measure();
      if (frame.contentDocument?.fonts) frame.contentDocument.fonts.ready.then(measure);
    });
    new ResizeObserver(fit).observe(area);
    if (frame.contentDocument?.readyState === "complete") measure();
  });

  const dialog = document.querySelector(".preview-dialog");
  const frame = dialog.querySelector("iframe");
  const viewport = dialog.querySelector(".preview-viewport");
  const fitButton = dialog.querySelector(".preview-fit");
  let opener, fullSize, fitted = false;
  function sizeModal() {
    frame.removeAttribute("style");
    if (!fitted || !fullSize) return;
    const scale = Math.min(viewport.clientWidth / fullSize.width, viewport.clientHeight / fullSize.height, 1);
    Object.assign(frame.style, { width: `${fullSize.width}px`, height: `${fullSize.height}px`, transform: `scale(${scale})` });
  }
  frame.addEventListener("load", () => {
    try {
      const doc = frame.contentDocument;
      const measure = () => { fullSize = dimensions(doc); sizeModal(); };
      measure();
      doc.fonts.ready.then(measure);
      // Escape inside an iframe does not bubble to the parent dialog.
      doc.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
        // These read-only exports have one focusable sheet region. Keep Tab in the modal.
        if (event.key === "Tab") {
          event.preventDefault();
          dialog.querySelector(event.shiftKey ? ".preview-direct" : ".preview-close").focus();
        }
      });
    } catch (_) { /* The direct link remains available if the frame cannot be inspected. */ }
  });
  document.querySelectorAll("[data-preview]").forEach(link => {
    link.addEventListener("click", event => {
      if (!dialog.showModal || location.protocol === "file:" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      fitted = false; fullSize = null;
      fitButton.setAttribute("aria-pressed", "false");
      dialog.querySelector("#preview-title").textContent = link.dataset.title;
      dialog.querySelector(".preview-direct").href = link.href;
      frame.title = `${link.dataset.title} — full preview`;
      frame.src = link.href;
      sizeModal();
      document.body.classList.add("preview-is-open");
      dialog.showModal();
      dialog.querySelector(".preview-close").focus();
    });
  });
  fitButton.addEventListener("click", () => {
    fitted = !fitted;
    fitButton.setAttribute("aria-pressed", String(fitted));
    sizeModal();
  });
  dialog.querySelector(".preview-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", event => {
    if (event.key === "Tab" && event.shiftKey && document.activeElement.matches(".preview-close")) {
      event.preventDefault();
      const sheet = frame.contentDocument?.querySelector(".ritz");
      if (sheet) sheet.focus();
      else dialog.querySelector(".preview-direct").focus();
    }
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("preview-is-open");
    frame.removeAttribute("src");
    opener?.focus({ preventScroll: true });
  });
  new ResizeObserver(sizeModal).observe(viewport);

  // Pain points: each card opens as it reaches the middle of the screen, then stays open.
  // Desktop hover/focus also opens it (CSS).
  const painGrid = document.querySelector(".pain-grid");
  const painCards = painGrid ? painGrid.querySelectorAll(".pain-card") : [];
  function measurePain() {
    if (!painGrid) return;
    painGrid.style.removeProperty("--pain-h");
    if (!desktopHover.matches) return;
    painGrid.classList.add("is-measuring");
    const tallest = Math.max(...Array.from(painCards, card => card.offsetHeight));
    painGrid.classList.remove("is-measuring");
    painGrid.style.setProperty("--pain-h", `${tallest}px`);
  }
  if (painGrid) {
    new ResizeObserver(measurePain).observe(painGrid);
    desktopHover.addEventListener("change", measurePain);
    document.fonts.ready.then(measurePain);
    if (canObserve) {
      watchZone(painCards, card => card.classList.add("is-open"));
    } else {
      painCards.forEach(card => card.classList.add("is-open"));
    }
  }

  // How It Works: the timeline draws once from step 1 to step 4.
  const steps = document.querySelector(".steps");
  if (steps && !reduceMotion.matches && "IntersectionObserver" in window) {
    steps.classList.add("is-pending");
    const draw = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        steps.classList.add("is-drawn");
        requestAnimationFrame(() => steps.classList.remove("is-pending"));
        draw.disconnect();
      }
    }, { threshold: 0.35 });
    draw.observe(steps);
  }

  // Gentle one-time entrances. Content is only held back while JS and motion are available.
  const reveals = document.querySelectorAll("[data-reveal]");
  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    reveals.forEach(el => el.classList.add("is-pending"));
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("is-pending");
        reveal.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    reveals.forEach(el => reveal.observe(el));
    reduceMotion.addEventListener("change", () => {
      if (reduceMotion.matches) reveals.forEach(el => el.classList.remove("is-pending"));
    });
  }

  // When Stronger Systems Make the Difference: tags turn lavender in sequence, and each
  // checklist row lifts as it reaches the middle of the screen. Both then stay that way.
  if (!reduceMotion.matches) {
    watchZone(document.querySelectorAll(".tags"), list => list.classList.add("is-active"));
    watchZone(document.querySelectorAll(".check-list li"), row => row.classList.add("is-active"), "-40%");
  }

  // Final CTA: a slow ambient ripple only while the section is on screen.
  const ambient = document.querySelector(".btn-ambient");
  if (ambient && "IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      ambient.classList.toggle("is-live", entries[0].isIntersecting);
    }, { threshold: 0.3 }).observe(ambient.closest("section") || ambient);
  }

  // Jewish Solar Challenge: always render the desktop site (1280px wide), scaled to fit.
  document.querySelectorAll(".site-frame").forEach(siteFrame => {
    const DESKTOP_WIDTH = 1280;
    siteFrame.classList.add("is-scaled");
    const fitSite = () => {
      const scale = siteFrame.clientWidth / DESKTOP_WIDTH;
      if (!scale) return;
      siteFrame.style.setProperty("--site-scale", scale.toFixed(4));
      siteFrame.style.setProperty("--site-h", `${Math.ceil(siteFrame.clientHeight / scale)}px`);
    };
    new ResizeObserver(fitSite).observe(siteFrame);
    fitSite();
  });

  document.querySelector("[data-year]").textContent = String(new Date().getFullYear());
})();
