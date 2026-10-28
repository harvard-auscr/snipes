"use strict";
// Renders standings.json (written by `snipebot site`). Every name goes in through
// textContent, never as HTML.
(() => {
  const TOP = 10;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString("en-US");
  const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;
  const list = (names) => new Intl.ListFormat("en", { type: "conjunction" }).format(names);
  let data = null;
  let view = "season";
  let expanded = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // "2026-10-22" or "2026-10-28T15:20-04:00" as the club's own local date/time, whatever
  // the viewer's time zone.
  function day(iso) {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US",
      { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }
  function clock(iso) {
    const [h, m] = iso.slice(11, 16).split(":").map(Number);
    return `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }

  function countUp(node, to) {
    if (reduce || !to) { node.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      node.textContent = fmt(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Bars start at zero and grow once the row is on screen.
  function grow(node, pct, delay) {
    node.style.setProperty("--d", `${delay}s`);
    const set = () => node.style.setProperty("--w", `${pct}%`);
    if (reduce) set();
    else requestAnimationFrame(() => requestAnimationFrame(set));
  }

  function leaderLine(rows) {
    const p = $("leader");
    p.textContent = "";
    if (view === "week") p.append(el("span", "since", `Since ${day(data.week.since)} · `));
    const first = rows.filter((r) => r.rank === 1);
    if (!first.length) return;
    if (first.length > 1) {
      p.append(el("b", null, list(first.map((r) => r.name))),
        ` are tied for first with ${plural(first[0].points, "point")}.`);
      return;
    }
    const lead = first[0];
    const second = rows.find((r) => r.rank > 1);
    p.append(el("b", null, lead.name), ` leads with ${plural(lead.points, "point")}`);
    if (second) p.append(", ", el("span", "gap", `${fmt(lead.points - second.points)} clear`), " of second.");
    else p.append(".");
  }

  function personRow(r, i, max) {
    const li = el("li", r.rank <= 3 ? "top" : "");
    const who = el("span", "who");
    const bits = [r.sibfam, plural(r.snipes, "snipe"), `sniped ${fmt(r.sniped)}×`].filter(Boolean);
    who.append(el("span", "name", r.name), el("span", "meta", bits.join(" · ")));
    const pts = el("span", "pts", fmt(r.points));
    pts.append(el("small", null, r.points === 1 ? "point" : "points"));
    li.append(el("span", "rank", String(r.rank)), who, pts);
    grow(li, max ? (100 * r.points) / max : 0, Math.min(i, 15) * 0.035);
    return li;
  }

  function renderBoard() {
    const rows = view === "season" ? data.season : data.week.people;
    const board = $("board");
    board.textContent = "";
    leaderLine(rows);
    const more = $("more");
    if (!rows.length) {
      board.append(el("li", "empty", view === "week" ? `No snipes yet since ${day(data.week.since)}.` : "No snipes yet."));
      more.hidden = true;
      return;
    }
    const max = rows[0].points;
    (expanded ? rows : rows.slice(0, TOP)).forEach((r, i) => board.append(personRow(r, i, max)));
    more.hidden = rows.length <= TOP;
    more.textContent = expanded ? `Show the top ${TOP}` : `Show all ${rows.length}`;
  }

  function select(next) {
    if (next === view) return;
    view = next;
    expanded = false;
    for (const [id, v] of [["tab-season", "season"], ["tab-week", "week"]]) {
      const tab = $(id);
      tab.setAttribute("aria-selected", String(v === view));
      tab.tabIndex = v === view ? 0 : -1;
    }
    renderBoard();
  }

  function renderSibfams() {
    const ol = $("sibfams");
    const groups = data.sibfams;
    ol.closest("section").hidden = !groups.length;
    const per = (g) => (g.members ? g.points / g.members : 0);
    const max = Math.max(0, ...groups.map(per));
    groups.forEach((g, i) => {
      const li = el("li");
      const val = el("span", "val", g.per_member);
      val.append(el("small", null, `${fmt(g.points)} pts · ${g.members} members`));
      const track = el("span", "track");
      const bar = el("i");
      track.append(bar);
      li.append(el("span", "rank", String(g.rank)), el("span", "label", g.name), val, track);
      li.style.setProperty("--d", `${i * 0.05}s`);
      grow(bar, max ? (100 * per(g)) / max : 0, 0.2 + i * 0.05);
      ol.append(li);
    });
  }

  function renderSniped() {
    const ol = $("sniped");
    ol.closest("section").hidden = !data.most_sniped.length;
    data.most_sniped.forEach((m, i) => {
      const li = el("li");
      const who = el("span", "who");
      who.append(el("span", "name", m.name));
      if (m.sibfam) who.append(el("span", "meta", m.sibfam));
      li.append(el("span", "rank", String(m.rank)), who, el("span", "val", fmt(m.sniped)));
      li.style.setProperty("--d", `${i * 0.04}s`);
      ol.append(li);
    });
  }

  function render() {
    $("semester").textContent = data.semester;
    countUp($("t-snipes"), data.totals.snipes);
    countUp($("t-selfies"), data.totals.selfies);
    countUp($("t-players"), data.totals.players);
    renderBoard();
    renderSibfams();
    renderSniped();
    if (data.latest_snipe) {
      $("updated").textContent = `Last snipe counted ${day(data.latest_snipe)}, ${clock(data.latest_snipe)}. ` +
        "The bot reads the channel a few times a day, so a new snipe can take a few hours to show up here.";
    }
    $("status").hidden = true;
    $("board-section").hidden = false;
    $("side").hidden = false;
  }

  $("tab-season").addEventListener("click", () => select("season"));
  $("tab-week").addEventListener("click", () => select("week"));
  $("tab-week").tabIndex = -1;
  document.querySelector(".views").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    select(view === "season" ? "week" : "season");
    $(view === "season" ? "tab-season" : "tab-week").focus();
  });
  $("more").addEventListener("click", () => { expanded = !expanded; renderBoard(); });

  fetch("standings.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((d) => { data = d; render(); })
    .catch(() => { $("status").textContent = "The standings didn't load. Try again in a minute."; });
})();
