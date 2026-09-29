/**
 * events-core.js
 *
 * Pure rendering: turns the array in data/events-source.json into the
 * three derived regions of events.html (stats, filter pills, card list).
 * Zero network access, zero knowledge of where the data file came from.
 * Used by scripts/build-events.js (the site build).
 */

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Advisory-only content warnings — never block a build. */
function getEventWarnings(event, index) {
  const warnings = [];
  const label = event.title || `event #${index + 1}`;
  if (!event.title) warnings.push(`Event #${index + 1}: missing title`);
  if (!event.date) warnings.push(`${label}: missing date`);
  if (!event.location) warnings.push(`${label}: missing location`);
  if (!Array.isArray(event.images) || event.images.length === 0) {
    warnings.push(`${label}: no gallery images — card will render without a photo`);
  }
  if (!Array.isArray(event.speakers) || event.speakers.length === 0) {
    warnings.push(`${label}: no speakers listed`);
  }
  if (event.status !== "Upcoming" && event.status !== "Past") {
    warnings.push(`${label}: status "${event.status}" is neither "Upcoming" nor "Past" — filter tabs won't match it`);
  }
  return warnings;
}

function renderStats(events) {
  const upcoming = events.filter((e) => e.status === "Upcoming").length;
  const past = events.filter((e) => e.status === "Past").length;
  return `<div class="stat"><div class="num">${upcoming}</div><div class="label">Upcoming</div></div>
      <div class="stat"><div class="num">${past}</div><div class="label">Past Events</div></div>`;
}

function renderFilters(events) {
  const upcoming = events.filter((e) => e.status === "Upcoming").length;
  const past = events.filter((e) => e.status === "Past").length;
  return `<button class="tag-pill active" data-filter="all">All (${events.length})</button>
      <button class="tag-pill" data-filter="Upcoming">Upcoming (${upcoming})</button>
      <button class="tag-pill" data-filter="Past">Past (${past})</button>`;
}

function renderGallery(event) {
  const images = Array.isArray(event.images) ? event.images : [];
  // Matches the existing hand-authored markup: image URLs' query-string "&"s
  // go into the single-quoted attribute unescaped (browsers parse this fine,
  // and the JSON is still read correctly via el.dataset.images at runtime).
  const dataImages = JSON.stringify(images);
  const altText = escapeHtml(event.title || "");
  const extra = images.length > 1
    ? `<span class="event-gallery-counter"></span></div>\n              <div class="event-gallery-thumbs"></div>`
    : `</div>`;
  return `<div class="event-gallery" data-images='${dataImages}'>
              <div class="event-gallery-main"><img src="" alt="${altText}" />${extra}
            </div>`;
}

function renderCard(event) {
  const isUpcoming = event.status === "Upcoming";
  const tagClass = isUpcoming ? "tag" : "tag tag-past";
  const attendeesLabel = isUpcoming ? "Expected Attendees" : "Attendees";
  const speakers = (event.speakers || [])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("\n              ");
  const registerLink = isUpcoming
    ? `\n            <a href="/contact.html" class="btn btn-outline mt-40">Register Now</a>`
    : "";

  return `      <article class="card event-card" data-status="${escapeHtml(event.status)}">
        <div class="event-card-grid">
          <div class="event-meta">
            <span class="${tagClass}">${escapeHtml(event.status)}</span>
            <p class="event-type">${escapeHtml(event.type)}</p>
            <p class="event-date">${escapeHtml(event.date)}</p>
            <p class="event-loc">${escapeHtml(event.location)}</p>
            <p class="event-meta-label">Speakers</p>
            <ul class="event-speakers">
              ${speakers}
            </ul>
            <p class="event-meta-label">${attendeesLabel}</p>
            <p class="event-attendees">${escapeHtml(event.attendees)}</p>${registerLink}
          </div>
          <div class="event-content">
            <h3>${escapeHtml(event.title)}</h3>
            <p class="event-subtitle">${escapeHtml(event.subtitle)}</p>
            <p>${escapeHtml(event.description)}</p>
            ${renderGallery(event)}
          </div>
        </div>
      </article>`;
}

function renderList(events) {
  return events.map(renderCard).join("\n\n");
}

module.exports = { escapeHtml, getEventWarnings, renderStats, renderFilters, renderList };
