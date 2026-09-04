// IncubXperts — shared site scripts

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }

  // Highlight active nav link based on current page
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.getAttribute("href") === current) a.classList.add("active");
  });

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
