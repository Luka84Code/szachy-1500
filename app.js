/* Promocja 1500 - dziennik partii Rapid z chess.com
   Partie: publiczne API chess.com (bez logowania).
   Notatki: plik data.json w prywatnym repozytorium GitHub (synchronizacja PC <-> telefon). */
(() => {
"use strict";

/* ================= Ustawienia ================= */
const BASE = Object.assign({
  chessUsername: "", goalRating: 1500, notesOwner: "", notesRepo: "szachy-1500-notatki", monthsToLoad: 6
}, window.APP_CONFIG || {});
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const DEMO = /[?&]demo=1/.test(location.search);
const DATA_KEY = DEMO ? "p15:demo" : "p15:data";

function cfg() {
  const o = LS.get("p15:cfg", {});
  return {
    user: (o.user || BASE.chessUsername || "").trim().toLowerCase(),
    owner: (o.owner || BASE.notesOwner || "").trim(),
    repo: (o.repo || BASE.notesRepo || "").trim(),
    token: (o.token || "").trim(),
    goal: Number(o.goal || BASE.goalRating) || 1500,
    months: Number(BASE.monthsToLoad) || 6
  };
}
function saveCfg(patch) { LS.set("p15:cfg", Object.assign(LS.get("p15:cfg", {}), patch)); }

/* Parowanie telefonu: link z #setup=... (z kodu QR) */
(function readSetupHash() {
  const m = location.hash.match(/^#setup=([A-Za-z0-9_\-]+)$/);
  if (!m) return;
  try {
    const json = b64decode(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    const s = JSON.parse(json);
    saveCfg({ user: s.u || "", owner: s.o || "", repo: s.r || "", token: s.t || "", goal: s.g || undefined });
    sessionStorage.setItem("p15:paired", "1");
  } catch {}
  history.replaceState(null, "", location.pathname + location.search);
})();

/* ================= Narzędzia ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function b64encode(str) {
  const bytes = new TextEncoder().encode(str); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
const fmtDate = ts => new Date(ts).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
const fmtDateY = ts => new Date(ts).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = ts => new Date(ts).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
const monthName = ts => new Date(ts).toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
}

/* ================= chess.com API ================= */
let jsonpN = 0;
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const name = "p15cb" + (++jsonpN) + Date.now();
    const s = document.createElement("script");
    const done = () => { delete window[name]; s.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error("timeout")); }, 15000);
    window[name] = data => { clearTimeout(timer); done(); resolve(data); };
    s.onerror = () => { clearTimeout(timer); done(); reject(new Error("jsonp")); };
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + name;
    document.head.appendChild(s);
  });
}
let useJsonp = false;
async function chessGet(path) {
  const url = "https://api.chess.com/pub/" + path;
  if (!useJsonp) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (r.status === 404) { const e = new Error("notfound"); e.code = 404; throw e; }
      if (!r.ok) throw new Error("http " + r.status);
      return await r.json();
    } catch (e) {
      if (e.code === 404) throw e;
      useJsonp = true; // przeglądarka zablokowała zwykłe zapytanie - próbujemy JSONP
    }
  }
  const d = await jsonp(url);
  if (d && d.code === 0) { const e = new Error("notfound"); e.code = 404; throw e; }
  return d;
}

const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
const REASON = {
  checkmated: "mat", resigned: "poddanie", timeout: "czas", abandoned: "porzucenie", agreed: "za zgodą",
  repetition: "powtórzenie", stalemate: "pat", insufficient: "brak materiału", "50move": "50 ruchów",
  timevsinsufficient: "czas, brak materiału", lose: "przegrana", win: "wygrana"
};

function openingFromUrl(u) {
  if (!u) return { full: "", family: "" };
  const slug = decodeURIComponent(String(u).split("/openings/")[1] || "").split("?")[0];
  if (!slug) return { full: "", family: "" };
  const toks = []; for (const t of slug.split("-")) { if (/^\d+\./.test(t) || /^\.\.\./.test(t)) break; toks.push(t); }
  const words = toks.map(t => t.replace(/^Kings$/, "King's").replace(/^Queens$/, "Queen's"));
  const full = words.join(" ");
  const keys = ["Opening", "Defense", "Defence", "Game", "Gambit", "Attack", "System"];
  let cut = words.findIndex(w => keys.includes(w));
  const family = cut >= 0 ? words.slice(0, cut + 1).join(" ") : words.slice(0, 3).join(" ");
  return { full, family };
}
function pgnTag(pgn, tag) { const m = (pgn || "").match(new RegExp("\\[" + tag + " \"([^\"]*)\"\\]")); return m ? m[1] : ""; }
function pgnMoves(pgn) {
  const body = (pgn || "").replace(/\[[^\]]*\]\s*/g, "").replace(/\{[^}]*\}/g, "").replace(/\d+\.\.\.\s*/g, "")
    .replace(/\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/, "").replace(/\s+/g, " ").trim();
  return body;
}
function normGame(g, user) {
  if (g.time_class !== "rapid" || (g.rules && g.rules !== "chess")) return null;
  const meWhite = (g.white?.username || "").toLowerCase() === user;
  const me = meWhite ? g.white : g.black, op = meWhite ? g.black : g.white;
  if (!me || !op) return null;
  const res = me.result === "win" ? "win" : DRAWS.has(me.result) ? "draw" : "loss";
  const reason = res === "win" ? (REASON[op.result] || op.result) : (REASON[me.result] || me.result);
  const ecoUrl = g.eco || pgnTag(g.pgn, "ECOUrl");
  const op1 = openingFromUrl(ecoUrl);
  const id = String(g.url || "").split("/").pop() || g.uuid || uid();
  return {
    id, url: g.url, end: (g.end_time || 0) * 1000, color: meWhite ? "white" : "black",
    myRating: me.rating, oppRating: op.rating, opp: op.username, res, reason, rated: g.rated !== false,
    opening: op1.full, family: op1.family, eco: pgnTag(g.pgn, "ECO"),
    acc: g.accuracies ? g.accuracies[meWhite ? "white" : "black"] : null,
    oppAcc: g.accuracies ? g.accuracies[meWhite ? "black" : "white"] : null,
    tc: g.time_control, moves: pgnMoves(g.pgn).split(" ").slice(0, 60).join(" "), delta: null
  };
}

/* ================= Stan ================= */
const S = {
  games: [], profile: null, stats: null, archives: [], loadedMonths: 0,
  data: LS.get(DATA_KEY, null) || emptyData(), sha: null,
  sync: { state: "local", at: null, msg: "" }, loading: false, err: null
};
function emptyData() { return { v: 1, notes: {}, drafts: {}, achievements: {}, focus: null, settings: {} }; }
function persistLocal() { LS.set(DATA_KEY, S.data); }

/* ================= Synchronizacja z GitHubem ================= */
const ghReady = () => { const c = cfg(); return !DEMO && !!(c.owner && c.repo && c.token); };
function ghUrl() { const c = cfg(); return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/data.json`; }
function ghHeaders() { return { Authorization: "Bearer " + cfg().token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }; }

async function ghRead() {
  const r = await fetch(ghUrl(), { headers: ghHeaders(), cache: "no-store" });
  if (r.status === 404) {
    // Brak pliku albo brak dostępu do repo - rozróżniamy po samym repo
    const rr = await fetch(ghUrl().replace(/\/contents\/data\.json$/, ""), { headers: ghHeaders(), cache: "no-store" });
    if (rr.status === 404) throw new Error("Nie widzę repozytorium " + cfg().owner + "/" + cfg().repo + ". Sprawdź nazwę i czy token ma do niego dostęp.");
    return { data: null, sha: null };
  }
  if (r.status === 401) throw new Error("Token GitHuba jest nieprawidłowy albo wygasł.");
  if (r.status === 403) throw new Error("Token nie ma uprawnień do tego repozytorium (potrzebne: Contents - Read and write).");
  if (!r.ok) throw new Error("GitHub odpowiedział błędem " + r.status + ".");
  const j = await r.json();
  return { data: JSON.parse(b64decode(j.content || "") || "null"), sha: j.sha };
}
async function ghWrite(data, sha) {
  const body = { message: "Notatki szachowe " + new Date().toISOString().slice(0, 16).replace("T", " "), content: b64encode(JSON.stringify(data, null, 1)) };
  if (sha) body.sha = sha;
  const r = await fetch(ghUrl(), { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()), body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) { const e = new Error("conflict"); e.conflict = true; throw e; }
  if (r.status === 401) throw new Error("Token GitHuba jest nieprawidłowy albo wygasł.");
  if (r.status === 403 || r.status === 404) throw new Error("Token nie może zapisywać w tym repozytorium (potrzebne: Contents - Read and write).");
  if (!r.ok) throw new Error("Zapis na GitHubie nie powiódł się (" + r.status + ").");
  const j = await r.json();
  return j.content.sha;
}

// Scalanie: każdy wpis ma updatedAt, wygrywa nowszy. Usunięte mają deleted:true.
function mergeMaps(a = {}, b = {}) {
  const out = Object.assign({}, a);
  for (const [k, v] of Object.entries(b)) if (!out[k] || (v.updatedAt || 0) > (out[k].updatedAt || 0)) out[k] = v;
  return out;
}
function newer(a, b) { if (!a) return b || null; if (!b) return a; return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a; }
function merge(a, b) {
  a = a || emptyData(); b = b || emptyData();
  return {
    v: 1,
    notes: mergeMaps(a.notes, b.notes),
    drafts: mergeMaps(a.drafts, b.drafts),
    achievements: mergeMaps(a.achievements, b.achievements),
    focus: newer(a.focus, b.focus),
    settings: newer(a.settings && a.settings.updatedAt ? a.settings : null, b.settings && b.settings.updatedAt ? b.settings : null) || {}
  };
}
const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let dirty = LS.get("p15:dirty", false), pushTimer = null, syncing = false;
function markDirty() { dirty = true; LS.set("p15:dirty", true); persistLocal(); clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 700); setSync(ghReady() ? "saving" : "local"); }

async function syncNow() {
  if (!ghReady() || syncing) { if (!ghReady()) setSync("local"); return; }
  syncing = true;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await ghRead();
      const merged = merge(remote.data, S.data);
      const changedLocal = !sameData(merged, S.data);
      S.data = merged; persistLocal();
      if (dirty || !remote.data || !sameData(merged, remote.data)) {
        try { S.sha = await ghWrite(merged, remote.sha); }
        catch (e) { if (e.conflict && attempt < 2) continue; throw e; }
      } else S.sha = remote.sha;
      dirty = false; LS.set("p15:dirty", false);
      if (changedLocal) { attachDrafts(); renderAll(); }
      setSync("ok");
      break;
    }
  } catch (e) {
    setSync("err", e.message);
  } finally { syncing = false; }
}
function setSync(state, msg = "") {
  S.sync = { state, at: state === "ok" ? now() : S.sync.at, msg };
  const el = $("#sync-line"); if (!el) return;
  const map = {
    ok: ["ok", "Notatki zsynchronizowane " + fmtTime(S.sync.at || now())],
    saving: ["warn", "Zapisuję notatki…"],
    local: ["warn", "Notatki tylko na tym urządzeniu. Połącz GitHuba w ustawieniach."],
    err: ["err", "Błąd synchronizacji: " + msg]
  };
  const [dot, text] = map[state] || map.local;
  el.innerHTML = `<span class="dot ${dot}"></span>${esc(text)}`;
}

/* ================= Wczytywanie partii ================= */
function monthKey(url) { return "p15:m:" + cfg().user + ":" + url.split("/games/")[1]; }
function isCurrentMonth(url) {
  const [y, m] = url.split("/games/")[1].split("/").map(Number); const d = new Date();
  return y === d.getUTCFullYear() && m === d.getUTCMonth() + 1 || (y === d.getFullYear() && m === d.getMonth() + 1);
}
async function loadMonth(url) {
  const key = monthKey(url);
  if (!isCurrentMonth(url)) { const c = LS.get(key, null); if (c) return c; }
  const j = await chessGet(url.split("/pub/")[1]);
  const list = (j.games || []).map(g => normGame(g, cfg().user)).filter(Boolean);
  LS.set(key, list);
  return list;
}
function addGames(list) {
  const byId = new Map(S.games.map(g => [g.id, g]));
  for (const g of list) byId.set(g.id, g);
  S.games = [...byId.values()].sort((a, b) => a.end - b.end);
  let prev = null;
  for (const g of S.games) { g.delta = prev && g.rated ? g.myRating - prev.myRating : null; if (g.rated) prev = g; }
}

async function loadAll(more = false) {
  const c = cfg();
  if (DEMO) { loadDemo(); return; }
  if (!c.user) { renderAll(); openSettings(true); return; }
  if (S.loading) return;
  S.loading = true; S.err = null; if (!S.games.length) renderGames();
  try {
    if (!more) {
      const [profile, stats, arch] = [await chessGet("player/" + c.user), await chessGet("player/" + c.user + "/stats"), await chessGet("player/" + c.user + "/games/archives")];
      S.profile = profile; S.stats = stats; S.archives = (arch.archives || []).slice().reverse();
      LS.set("p15:head:" + c.user, { profile, stats });
    }
    const target = more ? S.loadedMonths + 3 : Math.max(S.loadedMonths, c.months);
    // Kolejno, nie równolegle - tak każe chess.com
    for (let i = more ? S.loadedMonths : 0; i < Math.min(target, S.archives.length); i++) {
      addGames(await loadMonth(S.archives[i]));
      S.loadedMonths = Math.max(S.loadedMonths, i + 1);
      if (i === 0) { attachDrafts(); renderAll(); }
    }
  } catch (e) {
    S.err = e.code === 404 ? `Nie znalazłem gracza „${c.user}” na chess.com. Sprawdź nick w ustawieniach.` : "Nie udało się pobrać danych z chess.com. Sprawdź internet i kliknij Odśwież.";
  } finally {
    S.loading = false; attachDrafts(); renderAll();
  }
}

/* ================= Logika ================= */
const current = () => S.stats?.chess_rapid?.last?.rating ?? (S.games.length ? S.games[S.games.length - 1].myRating : null);
function startRating() {
  const s = S.data.settings?.startRating;
  if (s) return Number(s);
  const rated = S.games.filter(g => g.rated);
  return rated.length ? rated[0].myRating : current();
}
const note = id => { const n = S.data.notes[id]; return n && !n.deleted ? n : null; };
const myOpening = g => (note(g.id)?.myOpening || "").trim() || g.family || "Nieznane";
const oppOpening = g => (note(g.id)?.oppOpening || "").trim() || g.family || "Nieznane";

function attachDrafts() {
  const drafts = Object.values(S.data.drafts).filter(d => !d.deleted && !d.gameId);
  let changed = false;
  for (const d of drafts) {
    const g = S.games.find(x => x.end >= d.createdAt && x.end - d.createdAt < 4 * 3600e3);
    if (g) { attachDraftTo(d, g, true); changed = true; }
  }
  if (changed) markDirty();
}
function attachDraftTo(d, g, silent) {
  const n = Object.assign({}, note(g.id) || {});
  const stamp = fmtTime(d.createdAt);
  n.live = ((n.live ? n.live + "\n" : "") + `[${stamp}] ${d.text}`).trim();
  n.updatedAt = now();
  S.data.notes[g.id] = n;
  S.data.drafts[d.id] = Object.assign({}, d, { gameId: g.id, deleted: true, updatedAt: now() });
  if (!silent) { markDirty(); renderAll(); }
  toast(`Notatka przypięta do partii z ${g.opp}`);
}

/* ================= Renderowanie ================= */
const PAWN = `<svg class="pawn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.4a3.4 3.4 0 0 0-2.1 6.1c-1 .6-1.6 1.4-1.6 2.3h2.1c-.3 2.6-1.5 4.6-3.4 6.1V19h10v-2.1c-1.9-1.5-3.1-3.5-3.4-6.1h2.1c0-.9-.6-1.7-1.6-2.3A3.4 3.4 0 0 0 12 2.4ZM5.4 20h13.2v1.8H5.4z"/></svg>`;

function renderHero() {
  const c = cfg(), cur = current(), goal = c.goal;
  $("#nick").textContent = S.profile?.username || c.user || (DEMO ? "przykład" : "—");
  const av = $("#avatar"); if (S.profile?.avatar) { av.src = S.profile.avatar; av.hidden = false; } else av.hidden = true;
  $("#rating").textContent = cur ?? "—";
  $("#goal-label").textContent = goal;
  const togo = $("#to-go");
  if (cur == null) togo.textContent = S.loading ? "wczytywanie…" : "brak partii Rapid";
  else if (cur >= goal) togo.textContent = "Cel osiągnięty! Promocja!";
  else togo.textContent = `brakuje ${goal - cur} pkt do ${goal}`;
  const rec = S.stats?.chess_rapid?.record;
  const best = S.stats?.chess_rapid?.best?.rating;
  $("#record").textContent = rec ? `W ${rec.win} · R ${rec.draw} · P ${rec.loss}${best ? " · rekord " + best : ""}` : "";

  // Kolumna piona: pole 2 = start, pole 8 = cel
  const start = Math.min(startRating() ?? goal, goal - 1);
  const frac = cur == null ? 0 : clamp((cur - start) / (goal - start), 0, 1);
  const pawnRank = cur != null && cur >= goal ? 8 : 2 + Math.floor(frac * 6);
  let html = "";
  for (let r = 8; r >= 1; r--) {
    const val = r >= 2 ? Math.round((start + (goal - start) * (r - 2) / 6) / 10) * 10 : null;
    const lbl = r === 8 ? goal : r === 2 ? start : val;
    html += `<div class="cell${r <= pawnRank && r >= 2 ? " reached" : ""}${r === 8 ? " goal" : ""}">${r === pawnRank ? PAWN.replace('class="pawn"', `class="pawn${pawnRank === 8 ? " queen" : ""}"`) : ""}${lbl != null ? `<span class="lbl">${lbl}</span>` : ""}</div>`;
  }
  $("#file").innerHTML = html;

  const f = S.data.focus && !S.data.focus.deleted && S.data.focus.text ? S.data.focus.text : "";
  $("#focus-card").classList.toggle("empty", !f);
  $("#focus-text").textContent = f || "Kliknij, żeby wpisać jeden konkretny cel na najbliższe partie.";
}

function resLabel(g) { return { win: "Wygrana", loss: "Przegrana", draw: "Remis" }[g.res]; }
function deltaHtml(d) { if (d == null) return ""; const cls = d > 0 ? "up" : d < 0 ? "down" : ""; return `<span class="delta ${cls}">${d > 0 ? "+" : ""}${d}</span>`; }

function renderDrafts() {
  const ds = Object.values(S.data.drafts).filter(d => !d.deleted).sort((a, b) => b.createdAt - a.createdAt);
  const recent = S.games.slice(-5).reverse();
  $("#drafts").innerHTML = ds.length ? `<div class="drafts">${ds.map(d => `
    <div class="draft">
      <div class="draft-head"><span>Notatka czeka na partię · ${fmtDate(d.createdAt)} ${fmtTime(d.createdAt)}</span></div>
      <div class="draft-text">${esc(d.text)}</div>
      <div class="draft-actions">
        ${recent.length ? `<select class="chip" data-attach="${d.id}" aria-label="Przypnij do partii"><option value="">Przypnij do partii…</option>${recent.map(g => `<option value="${g.id}">${esc(g.opp)} · ${resLabel(g)} · ${fmtTime(g.end)}</option>`).join("")}</select>` : ""}
        <button class="chip" data-deldraft="${d.id}">Usuń</button>
      </div>
    </div>`).join("")}</div>` : "";
}

function renderGames() {
  renderDrafts();
  const box = $("#games");
  const banner = $("#banner");
  if (S.err) { banner.hidden = false; banner.className = "banner err"; banner.textContent = S.err; }
  else if (DEMO) { banner.hidden = false; banner.className = "banner"; banner.innerHTML = "<b>Tryb przykładowy.</b> To wymyślone partie do podglądu wyglądu aplikacji."; }
  else banner.hidden = true;

  if (!S.games.length) {
    box.innerHTML = S.loading ? `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>` :
      `<div class="empty-note">Brak partii Rapid w ostatnich miesiącach. Zagraj partię Rapid na chess.com, a pojawi się tutaj po zakończeniu (czasem z kilkuminutowym opóźnieniem).</div>`;
    $("#btn-more").hidden = true; return;
  }
  let html = "", lastM = "";
  for (const g of S.games.slice().reverse()) {
    const m = monthName(g.end); if (m !== lastM) { html += `<div class="month-label">${esc(m)}</div>`; lastM = m; }
    const n = note(g.id);
    const summary = n ? (n.why || n.work || n.good || n.live || "") : "";
    html += `<button class="game ${g.res}" data-game="${g.id}">
      <span class="stripe"></span>
      <span class="g-main">
        <span class="g-line1"><span class="piece ${g.color}" title="${g.color === "white" ? "Białe" : "Czarne"}"></span><span class="g-opp">${esc(g.opp)}</span><span class="g-opp-r">${g.oppRating}</span></span>
        <span class="g-open">${esc(n?.myOpening || g.opening || "Otwarcie nieznane")}${g.eco ? " · " + esc(g.eco) : ""}</span>
        <span class="g-meta">${fmtDate(g.end)} ${fmtTime(g.end)} · ${esc(g.reason || "")}${g.acc != null ? " · celność " + Math.round(g.acc) + "%" : ""}</span>
      </span>
      <span class="g-side"><span class="res-chip">${resLabel(g)}</span>${deltaHtml(g.delta)}</span>
      <span class="g-note${summary ? "" : " missing"}">${summary ? esc(summary.length > 160 ? summary.slice(0, 157) + "…" : summary) : "Brak notatki. Kliknij, żeby dopisać wnioski."}</span>
    </button>`;
  }
  box.innerHTML = html;
  $("#btn-more").hidden = DEMO || S.loadedMonths >= S.archives.length;
}

function renderChart() {
  const pts = S.games.filter(g => g.rated);
  const el = $("#chart"), goal = cfg().goal;
  if (pts.length < 2) { el.innerHTML = `<div class="empty-note" style="padding:20px">Wykres pojawi się po co najmniej dwóch partiach.</div>`; $("#chart-range").textContent = ""; return; }
  const W = 720, H = 280, L = 46, R = 58, T = 16, B = 30;
  const vals = pts.map(p => p.myRating);
  let lo = Math.min(...vals) - 25, hi = Math.max(goal, ...vals) + 25;
  lo = Math.floor(lo / 50) * 50; hi = Math.ceil(hi / 50) * 50;
  const x = i => L + (W - L - R) * (i / (pts.length - 1));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const step = (hi - lo) > 500 ? 200 : 100;
  let grid = "";
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    if (v === goal) continue;
    grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${v}</text>`;
  }
  // Etykiety miesięcy
  let months = "", lastM = -1;
  pts.forEach((p, i) => { const d = new Date(p.end); const m = d.getMonth(); if (m !== lastM) { lastM = m; months += `<text x="${x(i)}" y="${H - 8}" font-size="11" fill="var(--muted)" font-family="var(--f-mono)" text-anchor="${i === 0 ? "start" : "middle"}">${d.toLocaleDateString("pl-PL", { month: "short" })}</text><line x1="${x(i)}" x2="${x(i)}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--line)"/>`; } });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.myRating).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.length - 1)},${H - B}L${x(0)},${H - B}Z`;
  const last = pts[pts.length - 1];
  const dots = pts.length <= 80 ? pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.myRating)}" r="2.2" fill="${p.res === "win" ? "var(--win)" : p.res === "loss" ? "var(--loss)" : "var(--draw)"}"/>`).join("") : "";
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ranking Rapid w kolejnych partiach">
    <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".22"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--gold)" stroke-dasharray="5 5" stroke-width="1.5"/>
    <text x="${W - R + 6}" y="${y(goal) + 4}" font-size="12" fill="var(--gold)" font-family="var(--f-mono)" font-weight="600">${goal}</text>
    <path d="${area}" fill="url(#ar)"/>
    <path d="${line}" fill="none" stroke="var(--fg)" stroke-width="2" stroke-linejoin="round"/>
    ${dots}
    <circle cx="${x(pts.length - 1)}" cy="${y(last.myRating)}" r="5" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>
    <text x="${x(pts.length - 1) + 8}" y="${y(last.myRating) - 8}" font-size="12" fill="var(--fg)" font-family="var(--f-mono)" font-weight="600">${last.myRating}</text>
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>
    ${months}
  </svg>`;
  $("#chart-range").textContent = `${pts.length} partii · od ${fmtDateY(pts[0].end)}`;
}

function renderProgress() {
  renderChart();
  const goal = cfg().goal, cur = current(), rated = S.games.filter(g => g.rated);
  const startR = startRating() ?? cur ?? goal;
  const from = Math.floor(Math.min(startR, cur ?? startR) / 100) * 100 + 100;
  let ms = "";
  for (let v = from; v <= goal; v += 100) {
    const hit = rated.find(g => g.myRating >= v);
    const done = hit || (cur != null && cur >= v);
    ms += `<div class="ms ${done ? "done" : "todo"}"><span class="ms-val">${v}</span><span class="ms-sub">${hit ? "osiągnięte " + fmtDateY(hit.end) : done ? "osiągnięte wcześniej" : cur != null ? "brakuje " + (v - cur) + " pkt" : ""}</span></div>`;
  }
  $("#milestones").innerHTML = ms || `<div class="empty-note">Cel już osiągnięty. Ustaw wyższy w ustawieniach.</div>`;

  // Osiągnięcia automatyczne + wpisane
  const auto = [];
  const wins = S.games.filter(g => g.res === "win");
  if (wins.length) { const b = wins.reduce((a, g) => g.oppRating > a.oppRating ? g : a); auto.push({ m: "↑", t: `Najmocniejszy pokonany rywal: ${b.opp} (${b.oppRating})`, s: fmtDateY(b.end), game: b.id }); }
  let streak = 0, best = 0, bestEnd = null; for (const g of S.games) { if (g.res === "win") { streak++; if (streak > best) { best = streak; bestEnd = g.end; } } else streak = 0; }
  if (best >= 2) auto.push({ m: best, t: `Najdłuższa seria wygranych: ${best} z rzędu`, s: fmtDateY(bestEnd) });
  if (rated.length) { const p = rated.reduce((a, g) => g.myRating > a.myRating ? g : a); auto.push({ m: "★", t: `Najwyższy ranking w tych miesiącach: ${p.myRating}`, s: fmtDateY(p.end) }); }
  const accs = S.games.filter(g => g.acc != null); if (accs.length) { const a = accs.reduce((x, g) => g.acc > x.acc ? g : x); auto.push({ m: "%", t: `Najlepsza celność: ${Math.round(a.acc)}% (vs ${a.opp})`, s: fmtDateY(a.end), game: a.id }); }
  const manual = Object.values(S.data.achievements).filter(a => !a.deleted).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#achievements").innerHTML =
    manual.map(a => `<div class="ach"><span class="medal">★</span><div><div class="ach-title">${esc(a.title)}</div><div class="ach-sub">${esc(a.date ? fmtDateY(new Date(a.date).getTime()) : "")}${a.desc ? " · " + esc(a.desc) : ""}</div></div><button class="ach-del" data-delach="${a.id}" aria-label="Usuń osiągnięcie">×</button></div>`).join("") +
    auto.map(a => `<div class="ach"${a.game ? ` data-game="${a.game}" style="cursor:pointer"` : ""}><span class="medal auto">${esc(a.m)}</span><div><div class="ach-title">${esc(a.t)}</div><div class="ach-sub">${esc(a.s)} · liczone automatycznie</div></div><span></span></div>`).join("") ||
    `<div class="empty-note">Tu pojawią się Twoje osiągnięcia. Dodaj pierwsze przyciskiem „+ Dodaj”.</div>`;
}

function opStats(games, keyFn) {
  const m = new Map();
  for (const g of games) { const k = keyFn(g); const o = m.get(k) || { name: k, w: 0, d: 0, l: 0, n: 0 }; o[g.res[0]]++; o.n++; m.set(k, o); }
  return [...m.values()];
}
function opRows(list) {
  if (!list.length) return `<div class="empty-note">Brak partii.</div>`;
  return list.map(o => {
    const score = Math.round((o.w + o.d / 2) / o.n * 100);
    return `<div class="op-row"><div class="op-top"><span class="op-name">${esc(o.name)}</span><span class="op-n">${o.n} ${o.n === 1 ? "partia" : o.n < 5 ? "partie" : "partii"}</span></div>
      <div class="wdl"><i class="w" style="width:${o.w / o.n * 100}%"></i><i class="d" style="width:${o.d / o.n * 100}%"></i><i class="l" style="width:${o.l / o.n * 100}%"></i></div>
      <span class="op-pct">${o.w}W ${o.d}R ${o.l}P · wynik ${score}%</span></div>`;
  }).join("");
}
function renderOpenings() {
  const w = opStats(S.games.filter(g => g.color === "white"), myOpening).sort((a, b) => b.n - a.n).slice(0, 8);
  const b = opStats(S.games.filter(g => g.color === "black"), myOpening).sort((a, b) => b.n - a.n).slice(0, 8);
  $("#op-white").innerHTML = opRows(w); $("#op-black").innerHTML = opRows(b);
  const ag = opStats(S.games, oppOpening).filter(o => o.n >= 2).sort((a, b) => (a.w + a.d / 2) / a.n - (b.w + b.d / 2) / b.n).slice(0, 5);
  $("#op-against").innerHTML = ag.length ? opRows(ag) : `<div class="empty-note">Potrzeba co najmniej dwóch partii z tym samym otwarciem.</div>`;
}

const TAGS_BAD = ["Podstawka (blunder)", "Przegapiona taktyka", "Zabrakło czasu", "Grałem za szybko", "Słabe otwarcie", "Słaba końcówka", "Nie liczyłem wariantów", "Rozkojarzenie", "Wcześnie wyprowadzony hetman"];
const TAGS_GOOD = ["Dobra taktyka", "Mocne otwarcie", "Wygrana końcówka", "Atak na króla", "Dobre tempo gry", "Wykorzystany błąd rywala", "Spokojna obrona"];

function renderWork() {
  const counts = new Map();
  for (const g of S.games) { const n = note(g.id); if (!n?.tags) continue; for (const t of n.tags) { const c = counts.get(t) || { t, win: 0, loss: 0, n: 0 }; c.n++; if (g.res === "win") c.win++; if (g.res === "loss") c.loss++; counts.set(t, c); } }
  const list = [...counts.values()].sort((a, b) => b.n - a.n);
  $("#tagstats").innerHTML = list.length ? list.map(c => `<span class="tagstat ${c.loss > c.win ? "bad" : c.win > c.loss ? "good" : ""}">${esc(c.t)} <b>${c.n}</b></span>`).join("") : `<div class="empty-note">Zaznaczaj tagi w notatkach partii, a tutaj zobaczysz, co powtarza się najczęściej.</div>`;
  const work = S.games.slice().reverse().filter(g => note(g.id)?.work).slice(0, 15);
  $("#worklist").innerHTML = work.length ? work.map(g => `<div class="work" data-game="${g.id}"><span class="work-text">${esc(note(g.id).work)}</span><span class="work-meta">${fmtDate(g.end)} · vs ${esc(g.opp)} · ${resLabel(g)}</span></div>`).join("") : `<div class="empty-note">Tu zbiorą się wpisy z pola „Nad czym pracować” z Twoich notatek.</div>`;
}

function renderAll() { renderHero(); renderGames(); renderProgress(); renderOpenings(); renderWork(); }

/* ================= Arkusze (okna) ================= */
function openSheet(html) {
  $("#sheet-inner").innerHTML = html; $("#sheet").hidden = false; $("#sheet-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSheet() { $("#sheet").hidden = true; $("#sheet-backdrop").hidden = true; document.body.style.overflow = ""; }

function chipsHtml(tags, sel) { return tags.map(t => `<button type="button" class="chip${sel.includes(t) ? " on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join(""); }
function openingSuggestions() {
  const set = new Set(); for (const n of Object.values(S.data.notes)) { if (n.myOpening) set.add(n.myOpening); if (n.oppOpening) set.add(n.oppOpening); }
  for (const g of S.games) if (g.family) set.add(g.family);
  return [...set].sort();
}

function openGame(id) {
  const g = S.games.find(x => x.id === id); if (!g) return;
  const n = note(g.id) || {};
  const whyLabel = g.res === "win" ? "Dlaczego wygrałem" : g.res === "loss" ? "Dlaczego przegrałem" : "Dlaczego remis";
  const moves = g.moves.split(" ").filter(Boolean); let mv = "";
  for (let i = 0; i < Math.min(moves.length, 24); i += 2) mv += `${i / 2 + 1}. ${moves[i]} ${moves[i + 1] || ""}  `;
  const sel = n.tags || [];
  openSheet(`
    <div class="sheet-head"><div><h2>vs ${esc(g.opp)} (${g.oppRating})</h2>
      <div class="sheet-sub">${fmtDateY(g.end)} ${fmtTime(g.end)} · ${g.color === "white" ? "białe" : "czarne"} · ${resLabel(g)}, ${esc(g.reason)} ${g.delta != null ? "· " + (g.delta > 0 ? "+" : "") + g.delta : ""}</div></div>
      <button class="close" data-close aria-label="Zamknij">×</button></div>
    <div class="game-facts">
      <span>Otwarcie wg chess.com: <b>${esc(g.opening || "brak")}</b>${g.eco ? " (" + esc(g.eco) + ")" : ""}</span>
      ${g.acc != null ? `<span>Celność: <b>${Math.round(g.acc)}%</b> vs ${Math.round(g.oppAcc)}%</span>` : ""}
      <span><a href="${esc(g.url)}" target="_blank" rel="noopener">Zobacz partię</a> · <a href="https://www.chess.com/analysis/game/live/${esc(g.id)}?tab=review" target="_blank" rel="noopener">Analiza</a></span>
    </div>
    ${mv ? `<div class="moves">${esc(mv.trim())}${moves.length > 24 ? " …" : ""}</div>` : ""}
    <datalist id="op-list">${openingSuggestions().map(o => `<option value="${esc(o)}">`).join("")}</datalist>
    <div class="row2">
      <div class="field"><label for="f-my">Moje otwarcie</label><input id="f-my" list="op-list" value="${esc(n.myOpening || "")}" placeholder="${esc(g.family || "np. Partia włoska")}"></div>
      <div class="field"><label for="f-opp">Otwarcie przeciwnika</label><input id="f-opp" list="op-list" value="${esc(n.oppOpening || "")}" placeholder="np. Obrona sycylijska"></div>
    </div>
    ${g.family && !n.myOpening ? `<div class="chips"><button type="button" class="chip suggest" data-fill="f-my" data-val="${esc(g.family)}">Moje: ${esc(g.family)}</button><button type="button" class="chip suggest" data-fill="f-opp" data-val="${esc(g.family)}">Przeciwnika: ${esc(g.family)}</button></div>` : ""}
    <div class="field"><label for="f-why">${whyLabel}</label><textarea id="f-why" placeholder="Najważniejszy moment partii. Co przesądziło o wyniku?">${esc(n.why || "")}</textarea></div>
    <div class="field"><label for="f-good">Co zagrałem dobrze</label><textarea id="f-good" placeholder="Nawet w przegranej coś wyszło.">${esc(n.good || "")}</textarea></div>
    <div class="field"><label for="f-work">Nad czym pracować</label><textarea id="f-work" placeholder="Jedna konkretna rzecz na następne partie.">${esc(n.work || "")}</textarea></div>
    <div class="field"><label>Tagi</label><div class="chips" id="f-tags">${chipsHtml(TAGS_BAD, sel)}</div><div class="chips">${chipsHtml(TAGS_GOOD, sel)}</div></div>
    <div class="field"><label for="f-live">Notatki w trakcie partii</label><textarea id="f-live" placeholder="Tu trafiają szybkie notatki z telefonu.">${esc(n.live || "")}</textarea></div>
    <div class="sheet-actions"><button class="btn ghost" data-close>Anuluj</button><button class="btn" id="save-game" data-id="${g.id}">Zapisz notatkę</button></div>
  `);
}
function saveGame(id) {
  const tags = [...document.querySelectorAll("#sheet .chip.on[data-tag]")].map(b => b.dataset.tag);
  const n = {
    myOpening: $("#f-my").value.trim(), oppOpening: $("#f-opp").value.trim(),
    why: $("#f-why").value.trim(), good: $("#f-good").value.trim(), work: $("#f-work").value.trim(),
    live: $("#f-live").value.trim(), tags, updatedAt: now()
  };
  S.data.notes[id] = n; markDirty(); closeSheet(); renderAll(); toast("Notatka zapisana");
}

function openQuick() {
  openSheet(`
    <div class="sheet-head"><div><h2>Szybka notatka</h2><div class="sheet-sub">Pisz w trakcie partii. Przypnie się sama, gdy partia pojawi się z chess.com.</div></div><button class="close" data-close aria-label="Zamknij">×</button></div>
    <div class="field"><label for="q-text">Co się dzieje?</label><textarea id="q-text" placeholder="np. Zostawiłem skoczka bez obrony w 14. ruchu"></textarea></div>
    <div class="chips">${["Podstawka", "Mało czasu", "Dobry pomysł", "Nie wiem jak grać dalej", "Rywal mnie zaskoczył"].map(t => `<button type="button" class="chip" data-append="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <div class="sheet-actions"><button class="btn ghost" data-close>Anuluj</button><button class="btn" id="save-quick">Zapisz</button></div>
  `);
  setTimeout(() => $("#q-text")?.focus(), 50);
}
function saveQuick() {
  const t = $("#q-text").value.trim(); if (!t) { closeSheet(); return; }
  const d = { id: uid(), text: t, createdAt: now(), updatedAt: now() };
  S.data.drafts[d.id] = d; markDirty(); closeSheet(); renderAll(); toast("Zapisane. Czeka na partię.");
}

function openFocus() {
  const f = S.data.focus && !S.data.focus.deleted ? S.data.focus.text : "";
  openSheet(`
    <div class="sheet-head"><div><h2>Na czym się skupiam</h2><div class="sheet-sub">Jedna rzecz naraz działa lepiej niż pięć.</div></div><button class="close" data-close aria-label="Zamknij">×</button></div>
    <div class="field"><label for="fo-text">Mój cel na najbliższe partie</label><textarea id="fo-text" placeholder="np. Przed każdym ruchem sprawdzam, co atakuje rywal">${esc(f)}</textarea></div>
    <div class="sheet-actions"><button class="btn ghost" data-close>Anuluj</button><button class="btn" id="save-focus">Zapisz</button></div>
  `);
}
function openAch() {
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`
    <div class="sheet-head"><div><h2>Nowe osiągnięcie</h2></div><button class="close" data-close aria-label="Zamknij">×</button></div>
    <div class="field"><label for="a-title">Co osiągnąłem</label><input id="a-title" placeholder="np. Pierwszy mat dwoma gońcami"></div>
    <div class="row2">
      <div class="field"><label for="a-date">Kiedy</label><input id="a-date" type="date" value="${today}"></div>
      <div class="field"><label for="a-desc">Opis (opcjonalnie)</label><input id="a-desc" placeholder="krótko"></div>
    </div>
    <div class="sheet-actions"><button class="btn ghost" data-close>Anuluj</button><button class="btn" id="save-ach">Dodaj</button></div>
  `);
}

function openSettings(first) {
  const c = cfg();
  openSheet(`
    <div class="sheet-head"><div><h2>${first ? "Witaj! Ustawmy aplikację" : "Ustawienia"}</h2><div class="sheet-sub">Zapisywane tylko na tym urządzeniu</div></div>${first ? "" : `<button class="close" data-close aria-label="Zamknij">×</button>`}</div>
    <div class="field"><label for="s-user">Nick na chess.com</label><input id="s-user" value="${esc(c.user)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="nick"></div>
    <div class="row2">
      <div class="field"><label for="s-goal">Cel (Rapid)</label><input id="s-goal" type="number" inputmode="numeric" value="${c.goal}"></div>
      <div class="field"><label for="s-start">Ranking na starcie</label><input id="s-start" type="number" inputmode="numeric" value="${esc(S.data.settings?.startRating || "")}" placeholder="${startRating() ?? ""}"></div>
    </div>
    <div class="hint">Ranking na starcie to pole, z którego wyrusza pion. Puste = ranking z najstarszej wczytanej partii.</div>
    <div class="field"><label>Synchronizacja notatek (GitHub)</label>
      <div class="row2"><input id="s-owner" value="${esc(c.owner)}" placeholder="właściciel repo" autocapitalize="off" spellcheck="false" aria-label="Właściciel repozytorium"><input id="s-repo" value="${esc(c.repo)}" placeholder="nazwa repo" autocapitalize="off" spellcheck="false" aria-label="Nazwa repozytorium"></div>
      <input id="s-token" type="password" value="${esc(c.token)}" placeholder="token GitHuba (github_pat_…)" autocomplete="off" spellcheck="false" aria-label="Token GitHuba">
    </div>
    <div class="hint">Bez tokena notatki zapisują się tylko na tym urządzeniu. Z tokenem są wspólne dla komputera i telefonu.</div>
    <div class="sheet-actions">
      ${ghReady() ? `<button class="btn ghost" id="btn-pair">Połącz telefon (kod QR)</button>` : ""}
      <span class="spacer"></span>
      ${first ? "" : `<button class="btn ghost" data-close>Anuluj</button>`}
      <button class="btn" id="save-settings">Zapisz</button>
    </div>
  `);
}
function saveSettings() {
  const prevUser = cfg().user, prevRepo = cfg().owner + "/" + cfg().repo;
  saveCfg({ user: $("#s-user").value.trim().toLowerCase(), goal: Number($("#s-goal").value) || 1500, owner: $("#s-owner").value.trim(), repo: $("#s-repo").value.trim(), token: $("#s-token").value.trim() });
  const st = $("#s-start").value.trim();
  if (String(st) !== String(S.data.settings?.startRating || "")) { S.data.settings = { startRating: st ? Number(st) : null, updatedAt: now() }; markDirty(); }
  closeSheet();
  if (!cfg().user) { openSettings(true); return; }
  if (cfg().user !== prevUser) { S.games = []; S.loadedMonths = 0; S.profile = null; S.stats = null; loadAll(); }
  if (cfg().owner + "/" + cfg().repo !== prevRepo || ghReady()) syncNow();
  renderAll(); toast("Ustawienia zapisane");
}
function openPair() {
  const c = cfg();
  const payload = b64encode(JSON.stringify({ u: c.user, o: c.owner, r: c.repo, t: c.token, g: c.goal })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const link = location.origin + location.pathname + "#setup=" + payload;
  openSheet(`
    <div class="sheet-head"><div><h2>Połącz telefon</h2><div class="sheet-sub">Zeskanuj aparatem w telefonie</div></div><button class="close" data-close aria-label="Zamknij">×</button></div>
    <div class="qr" id="qr"></div>
    <ol class="steps"><li>Otwórz aparat w telefonie i nakieruj go na kod.</li><li>Kliknij link, który się pojawi. Aplikacja ustawi się sama.</li><li>W przeglądarce telefonu wybierz „Dodaj do ekranu głównego”.</li></ol>
    <div class="hint">Nie pokazuj tego kodu nikomu. Daje dostęp do Twoich notatek.</div>
    <div class="sheet-actions"><button class="btn" data-close>Gotowe</button></div>
  `);
  try { new QRCode($("#qr"), { text: link, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.L }); }
  catch { $("#qr").outerHTML = `<div class="code">${esc(link)}</div>`; }
}

/* ================= Zdarzenia ================= */
document.addEventListener("click", e => {
  const t = e.target.closest("button, [data-game], [data-close]"); if (!t) return;
  if (t.matches("[data-close]")) return closeSheet();
  if (t.dataset.game && !t.closest(".sheet")) return openGame(t.dataset.game);
  if (t.dataset.game) { closeSheet(); return openGame(t.dataset.game); }
  if (t.dataset.tag) return t.classList.toggle("on");
  if (t.dataset.fill) { $("#" + t.dataset.fill).value = t.dataset.val; t.remove(); return; }
  if (t.dataset.append) { const ta = $("#q-text"); ta.value = (ta.value ? ta.value.trim() + " " : "") + t.dataset.append; ta.focus(); return; }
  if (t.dataset.deldraft) { const d = S.data.drafts[t.dataset.deldraft]; S.data.drafts[d.id] = Object.assign({}, d, { deleted: true, updatedAt: now() }); markDirty(); renderAll(); return; }
  if (t.dataset.delach) { const a = S.data.achievements[t.dataset.delach]; S.data.achievements[a.id] = Object.assign({}, a, { deleted: true, updatedAt: now() }); markDirty(); renderAll(); return; }
  switch (t.id) {
    case "save-game": return saveGame(t.dataset.id);
    case "save-quick": return saveQuick();
    case "save-focus": { const v = $("#fo-text").value.trim(); S.data.focus = { text: v, updatedAt: now() }; markDirty(); closeSheet(); renderAll(); return; }
    case "save-ach": { const ti = $("#a-title").value.trim(); if (!ti) return $("#a-title").focus(); const a = { id: uid(), title: ti, date: $("#a-date").value, desc: $("#a-desc").value.trim(), updatedAt: now() }; S.data.achievements[a.id] = a; markDirty(); closeSheet(); renderAll(); toast("Osiągnięcie dodane"); return; }
    case "save-settings": return saveSettings();
    case "btn-pair": return openPair();
    case "btn-settings": return openSettings(false);
    case "fab": return openQuick();
    case "btn-add-ach": return openAch();
    case "btn-refresh": return refresh(true);
    case "btn-more": return loadAll(true);
  }
  if (t.classList.contains("tab")) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("is-active", b === t));
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("is-active", v.id === "view-" + t.dataset.view));
  }
});
$("#focus-card").addEventListener("click", openFocus);
$("#sheet-backdrop").addEventListener("click", () => { if (cfg().user) closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden && cfg().user) closeSheet(); });
document.addEventListener("change", e => {
  const s = e.target.closest("[data-attach]"); if (!s || !s.value) return;
  const d = S.data.drafts[s.dataset.attach], g = S.games.find(x => x.id === s.value);
  if (d && g) attachDraftTo(d, g, false);
});

async function refresh(manual) {
  if (DEMO) return;
  if (manual) toast("Odświeżam…");
  const c = cfg(); if (!c.user) return;
  try {
    S.stats = await chessGet("player/" + c.user + "/stats");
    if (S.archives.length) {
      const arch = await chessGet("player/" + c.user + "/games/archives");
      const list = (arch.archives || []).slice().reverse();
      if (list[0] !== S.archives[0]) { S.archives = list; S.loadedMonths = Math.min(S.loadedMonths + 1, list.length); }
      addGames(await loadMonth(S.archives[0]));
    }
    S.err = null;
  } catch { if (manual) toast("Nie udało się połączyć z chess.com"); }
  attachDrafts(); renderAll();
  syncNow();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(false); });
setInterval(() => { if (!document.hidden) syncNow(); }, 45000);
setInterval(() => { if (!document.hidden) refresh(false); }, 180000);

/* ================= Tryb przykładowy (?demo=1) ================= */
function loadDemo() {
  const ops = [["Italian Game", "C50"], ["Sicilian Defense", "B20"], ["Queen's Pawn Opening", "D00"], ["Scandinavian Defense", "B01"], ["French Defense", "C00"], ["London System", "D02"]];
  const names = ["KnightRider77", "pawnstorm_pl", "Bishop_Bob", "e4enjoyer", "zugzwang_kid", "TacticTom", "rookie_ana", "castleQ"];
  let r = 1180, t = Date.now() - 1000 * 3600 * 24 * 75, rnd = 7;
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const list = [];
  for (let i = 0; i < 64; i++) {
    t += 3600e3 * (12 + rand() * 30);
    const res = rand() < .52 ? "win" : rand() < .9 ? "loss" : "draw";
    const d = res === "win" ? 6 + Math.round(rand() * 4) : res === "loss" ? -(6 + Math.round(rand() * 4)) : Math.round(rand() * 2 - 1);
    r += d; const [op, eco] = ops[Math.floor(rand() * ops.length)];
    list.push({ id: "demo" + i, url: "https://www.chess.com/game/live/0", end: t, color: rand() < .5 ? "white" : "black", myRating: r, oppRating: r + Math.round(rand() * 120 - 60), opp: names[Math.floor(rand() * names.length)], res, reason: res === "win" ? ["poddanie", "mat", "czas"][Math.floor(rand() * 3)] : res === "loss" ? ["poddanie", "mat", "czas"][Math.floor(rand() * 3)] : "powtórzenie", rated: true, opening: op, family: op, eco, acc: 55 + rand() * 35, oppAcc: 50 + rand() * 35, tc: "600", moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O", delta: null });
  }
  S.games = []; addGames(list);
  S.stats = { chess_rapid: { last: { rating: r }, best: { rating: Math.max(...list.map(g => g.myRating)) }, record: { win: 120, loss: 98, draw: 9 } } };
  S.archives = ["x"]; S.loadedMonths = 1;
  if (!Object.keys(S.data.notes).length) {
    const last = S.games[S.games.length - 1], prev = S.games[S.games.length - 3];
    S.data.notes[last.id] = { myOpening: "Partia włoska", oppOpening: "Obrona dwóch skoczków", why: "Rywal zostawił gońca na f7, a ja tego nie zauważyłem przez 3 ruchy. Potem przegrałem jakość.", work: "Po każdym ruchu rywala pytać: co on atakuje?", tags: ["Przegapiona taktyka", "Grałem za szybko"], updatedAt: 1 };
    S.data.notes[prev.id] = { myOpening: "Obrona skandynawska", why: "Dobrze zagrany atak na króla po roszadzie krótkiej.", work: "Ćwiczyć końcówki wieżowe", tags: ["Atak na króla", "Dobra taktyka"], updatedAt: 1 };
    S.data.focus = { text: "Zanim ruszę, sprawdzam szachy, bicia i groźby rywala", updatedAt: 1 };
    S.data.drafts.demo = { id: "demo", text: "14. ruch: chyba podstawiłem skoczka, rywal ma widełki", createdAt: Date.now() - 600e3, updatedAt: 1 };
    S.data.achievements.a1 = { id: "a1", title: "Pierwszy mat w mniej niż 20 ruchach", date: new Date(Date.now() - 86400e3 * 12).toISOString().slice(0, 10), updatedAt: 1 };
  }
  renderAll();
}

/* ================= Start ================= */
renderAll();
setSync(ghReady() ? "saving" : "local");
if (sessionStorage.getItem("p15:paired")) { sessionStorage.removeItem("p15:paired"); setTimeout(() => toast("Telefon połączony"), 400); }
if (!DEMO) { const h = LS.get("p15:head:" + cfg().user, null); if (h) { S.profile = h.profile; S.stats = h.stats; } }
loadAll().then(() => syncNow());
})();
