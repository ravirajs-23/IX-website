// IncubXperts — shared site scripts

// Homepage hero carousel content. To add, remove, or edit a slide, just
// edit this array — renderHeroSlide() below reads it and updates the DOM;
// no other code or markup needs to change.
const HERO_SLIDES = [
  {
    num: "01",
    tag: "AI Adoption and Strategy",
    title: "Redefine What&rsquo;s Possible with AI",
    subtitle:
      "Strategic, value-focused AI adoption tailored for your business — from purpose-built strategy to autonomous agentic solutions and AI-ready cloud infrastructure.",
    image: "/images/hero/slide-1-ai-adoption.webp",
  },
  {
    num: "02",
    tag: "Agentic Solutions",
    title: "Where Intelligence Becomes Action",
    subtitle:
      "Autonomous AI agents that think, decide, and deliver reliable, real-world outcomes.",
    image: "/images/hero/slide-2-agentic-solutions.webp",
  },
  {
    num: "03",
    tag: "Cloud & AI Infrastructure",
    title: "Architect the Foundations of Intelligence",
    subtitle:
      "Modern, scalable, and AI-ready cloud infrastructure built for performance, resilience, and growth.",
    image: "/images/hero/slide-3-cloud-infra.webp",
  },
];
const HERO_SLIDE_DURATION_MS = 6000;

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }

  // Highlight active nav link based on current page (hrefs may be root-
  // relative, e.g. "/index.html", so compare with any leading slash stripped).
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = (a.getAttribute("href") || "").replace(/^\//, "");
    if (href === current) a.classList.add("active");
  });

  // Homepage hero carousel — see the HERO_SLIDES array above. All slide
  // tabs render simultaneously (matching the live site); the progress bar
  // is one shared track, filling the active slide's segment of it.
  const heroSection = document.querySelector("#heroCarousel");
  if (heroSection) {
    const els = {
      title: heroSection.querySelector('[data-hero="title"]'),
      subtitle: heroSection.querySelector('[data-hero="subtitle"]'),
      tabsContainer: heroSection.querySelector('[data-hero="tabs"]'),
      progress: heroSection.querySelector('[data-hero="progress"]'),
    };
    let index = 0;
    let timer = null;

    const tabs = HERO_SLIDES.map((slide, i) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "hero-tab";
      tab.innerHTML = `<span class="hero-tab-num">${slide.num}</span><span class="hero-tab-tag">${slide.tag}</span>`;
      tab.addEventListener("click", () => {
        goTo(i);
        restartAutoplay();
      });
      els.tabsContainer?.appendChild(tab);
      return tab;
    });

    function renderHeroSlide(i) {
      const slide = HERO_SLIDES[i];
      if (!slide) return;
      if (els.title) els.title.innerHTML = slide.title;
      if (els.subtitle) els.subtitle.textContent = slide.subtitle;
      heroSection.style.backgroundImage = `url('${slide.image}')`;
      tabs.forEach((tab, t) => tab.classList.toggle("active", t === i));

      if (els.progress) {
        const segment = 100 / HERO_SLIDES.length;
        els.progress.style.transition = "none";
        els.progress.style.width = `${i * segment}%`;
        // Force reflow so the transition below actually restarts.
        void els.progress.offsetWidth;
        els.progress.style.transition = `width ${HERO_SLIDE_DURATION_MS}ms linear`;
        els.progress.style.width = `${(i + 1) * segment}%`;
      }
    }

    function goTo(i) {
      index = (i + HERO_SLIDES.length) % HERO_SLIDES.length;
      renderHeroSlide(index);
    }

    function restartAutoplay() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => goTo(index + 1), HERO_SLIDE_DURATION_MS);
    }

    heroSection.querySelector("[data-hero-prev]")?.addEventListener("click", () => {
      goTo(index - 1);
      restartAutoplay();
    });
    heroSection.querySelector("[data-hero-next]")?.addEventListener("click", () => {
      goTo(index + 1);
      restartAutoplay();
    });

    goTo(0);
    restartAutoplay();
  }

  // Simple contact/careers form handler (no backend wired up yet)
  const forms = document.querySelectorAll("form[data-form]");
  forms.forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = form.querySelector(".form-note");
      if (note) {
        note.textContent = "Thanks! Your message has been noted. Our team will get back to you shortly.";
        note.style.color = "#1868f0";
      }
      form.reset();
    });
  });

  // Case Stories listing: category filter pills + search + "view more" reveal.
  const filterBar = document.querySelector(".cs-filter-bar");
  if (filterBar) {
    const cards = [...document.querySelectorAll(".cs-card-grid .cs-card")];
    const pills = [...filterBar.querySelectorAll(".cs-filter-pill")];
    const searchInput = filterBar.querySelector(".cs-search");
    const viewMoreBtn = document.querySelector(".cs-view-more");
    const PAGE_SIZE = 6;
    let activeCategory = "All";
    let visibleCount = PAGE_SIZE;

    function matches(card, query) {
      const cat = card.dataset.category || "";
      const title = (card.dataset.title || "").toLowerCase();
      const matchesCategory = activeCategory === "All" || cat === activeCategory;
      const matchesSearch = !query || title.includes(query);
      return matchesCategory && matchesSearch;
    }

    function applyFilters() {
      const query = (searchInput?.value || "").trim().toLowerCase();
      let shown = 0;
      cards.forEach((card) => {
        const isMatch = matches(card, query);
        const withinPage = isMatch && shown < visibleCount;
        if (isMatch) shown++;
        card.hidden = !withinPage;
      });
      if (viewMoreBtn) viewMoreBtn.hidden = shown <= visibleCount;
    }

    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        pills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeCategory = pill.dataset.filter;
        visibleCount = PAGE_SIZE;
        applyFilters();
      });
    });
    searchInput?.addEventListener("input", () => {
      visibleCount = PAGE_SIZE;
      applyFilters();
    });
    viewMoreBtn?.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      applyFilters();
    });

    applyFilters();
  }
});
