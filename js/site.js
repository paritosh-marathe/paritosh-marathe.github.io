(() => {
  "use strict";

  const themeToggle = document.querySelector("[data-theme-toggle]");
  const applyTheme = (light) => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    if (themeToggle) {
      themeToggle.setAttribute("aria-pressed", String(light));
      themeToggle.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    }
    document.querySelectorAll("[data-theme-dark]").forEach((image) => {
      image.src = light ? image.dataset.themeLight : image.dataset.themeDark;
    });
  };

  applyTheme(document.documentElement.dataset.theme === "light");
  if (themeToggle) {
    themeToggle.hidden = false;
    themeToggle.addEventListener("click", () => {
      const light = document.documentElement.dataset.theme !== "light";
      applyTheme(light);
      try {
        localStorage.setItem("pm-theme", light ? "light" : "dark");
      } catch (_) {}
    });
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const header = document.querySelector("[data-header]");
  const nav = document.querySelector("[data-nav]");
  const toggle = document.querySelector("[data-nav-toggle]");

  const setNavOpen = (open) => {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      setNavOpen(!nav.classList.contains("is-open"));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setNavOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setNavOpen(false);
    });
  }

  if (header) {
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  const hero = document.querySelector(".hero");
  if (hero) {
    if (reduceMotion) {
      hero.classList.add("is-visible");
    } else {
      requestAnimationFrame(() => hero.classList.add("is-visible"));
    }
  }

  const revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length === 0) return;

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  revealEls.forEach((el) => observer.observe(el));
})();
