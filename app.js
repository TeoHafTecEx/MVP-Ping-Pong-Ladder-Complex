(() => {
  "use strict";

  const STORAGE_KEY = "pp_ladder_v2_state";
  const SYNC_KEY = "pp_ladder_v2_github_sync";

  // Hardcoded GitHub sync target.
  // Edit these four values once before deploying to GitHub Pages.
  // Do not put a GitHub token here; tokens must stay local to each admin browser.
  const GITHUB_SYNC_TARGET = {
    owner: "TeoHafTecEx",
    repo: "MVP-Ping-Pong-Ladder-Complex",
    branch: "main",
    path: "data/state.json"
  };

  const DEFAULT_STATE = {
    version: 2,
    season: { name: "Season 1", startedAt: new Date().toISOString() },
    settings: {
      challengeUpLimit: 2,
      pushDownLimit: 1,
      blockBackToBack: true,
      inactiveDropOneDays: 7,
      inactiveDropTwoDays: 14,
      inactiveDropBottomDays: 21
    },
    players: [
      { id: "p_owen", name: "Owen", active: true },
      { id: "p_judels", name: "Judels", active: true },
      { id: "p_cam", name: "Cam", active: true },
      { id: "p_tash", name: "Tash", active: true }
    ],
    ladder: ["p_owen", "p_judels", "p_cam", "p_tash"],
    matches: []
  };

  let state = normalize(loadState());
  let syncSettings = loadSyncSettings();

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[ch]));
  }

  function toast(message, type = "") {
    const host = $("#toastHost");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(5px)";
      el.style.transition = "180ms ease";
      setTimeout(() => el.remove(), 220);
    }, 3600);
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_STATE;
    } catch {
      return DEFAULT_STATE;
    }
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadSyncSettings() {
    const fallback = { ...GITHUB_SYNC_TARGET, token: "" };
    try {
      const saved = JSON.parse(localStorage.getItem(SYNC_KEY)) || {};
      return { ...fallback, token: saved.token || "" };
    } catch {
      return fallback;
    }
  }

  function saveSyncSettings() {
    // Store only the admin token locally. The repo target is hardcoded above.
    localStorage.setItem(SYNC_KEY, JSON.stringify({ token: syncSettings.token || "" }));
  }

  function normalize(input) {
    const s = structuredClone(input || DEFAULT_STATE);
    s.version = 2;
    s.settings = { ...DEFAULT_STATE.settings, ...(s.settings || {}) };
    s.season = { ...DEFAULT_STATE.season, ...(s.season || {}) };
    s.players = Array.isArray(s.players) ? s.players.filter(p => p && p.id && p.name).map(p => ({ id: String(p.id), name: String(p.name).trim(), active: p.active !== false })) : [];
    const ids = new Set(s.players.map(p => p.id));
    s.ladder = Array.isArray(s.ladder) ? s.ladder.filter(id => ids.has(id)) : [];
    for (const p of s.players) if (!s.ladder.includes(p.id) && p.active) s.ladder.push(p.id);
    s.matches = Array.isArray(s.matches) ? s.matches : [];
    return s;
  }

  function player(id) { return state.players.find(p => p.id === id) || null; }
  function name(id) { return player(id)?.name || "Unknown"; }
  function rankOf(id) { const i = state.ladder.indexOf(id); return i >= 0 ? i + 1 : null; }
  function activePlayers() { return state.ladder.map(player).filter(Boolean).filter(p => p.active); }

  function statsByPlayer() {
    const map = new Map(state.players.map(p => [p.id, { wins: 0, losses: 0, streak: 0, played: 0, lastPlayed: "", challengeWins: 0, giantKills: 0, pushDownWins: 0 }]));
    const sorted = [...state.matches].sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const m of sorted) {
      const win = map.get(m.winnerId);
      const loserId = m.winnerId === m.challengerId ? m.defenderId : m.challengerId;
      const loss = map.get(loserId);
      if (!win || !loss) continue;
      win.wins++; win.played++; win.lastPlayed = m.date; win.streak = win.streak > 0 ? win.streak + 1 : 1;
      loss.losses++; loss.played++; loss.lastPlayed = m.date; loss.streak = loss.streak < 0 ? loss.streak - 1 : -1;
      if (m.winnerId === m.challengerId && m.direction === "up") win.challengeWins++;
      if (m.winnerId === m.challengerId && m.direction === "up" && Math.abs(m.challengeDistance) >= 2) win.giantKills++;
      if (m.winnerId === m.challengerId && m.direction === "down") win.pushDownWins++;
    }
    return map;
  }

  function lastOpponent(challengerId) {
    for (const m of [...state.matches].sort((a, b) => new Date(b.date) - new Date(a.date))) {
      if (m.challengerId === challengerId) return m.defenderId;
      if (m.defenderId === challengerId) return m.challengerId;
    }
    return null;
  }

  function challengeRule(challengerId, defenderId) {
    const cRank = rankOf(challengerId);
    const dRank = rankOf(defenderId);
    if (!cRank || !dRank) return { allowed: false, reason: "Both players must be active on the ladder.", direction: "none", challengeDistance: 0 };
    if (challengerId === defenderId) return { allowed: false, reason: "A player cannot challenge themselves.", direction: "none", challengeDistance: 0 };
    const upDist = cRank - dRank;
    const downDist = dRank - cRank;
    const upward = upDist >= 1 && upDist <= state.settings.challengeUpLimit;
    const downward = downDist >= 1 && downDist <= state.settings.pushDownLimit;
    if (state.settings.blockBackToBack && lastOpponent(challengerId) === defenderId) {
      return { allowed: false, reason: "Back-to-back repeat challenges are blocked.", direction: "none", challengeDistance: 0 };
    }
    if (upward) return { allowed: true, reason: `Valid upward challenge: ${upDist} rank(s).`, direction: "up", challengeDistance: upDist };
    if (downward) return { allowed: true, reason: "Valid push-down challenge: one rank below.", direction: "down", challengeDistance: -downDist };
    return { allowed: false, reason: "Invalid challenge range.", direction: "none", challengeDistance: 0 };
  }

  function allowedDefenders(challengerId) {
    return activePlayers().filter(p => p.id !== challengerId && challengeRule(challengerId, p.id).allowed);
  }

  function movementFor(challengerId, defenderId, winnerId) {
    const rule = challengeRule(challengerId, defenderId);
    if (!rule.allowed) return { ...rule, movement: "none", text: rule.reason };
    if (rule.direction === "up") {
      if (winnerId === challengerId) return { ...rule, movement: "swap", text: `${name(challengerId)} takes rank #${rankOf(defenderId)}. ${name(defenderId)} drops one spot.` };
      return { ...rule, movement: "none", text: `${name(defenderId)} defends. Ladder order stays the same.` };
    }
    if (rule.direction === "down") {
      if (winnerId === challengerId) return { ...rule, movement: "pushDown", text: `${name(defenderId)} is pushed down one rank. The player below moves up.` };
      return { ...rule, movement: "swap", text: `${name(defenderId)} beats the higher-ranked challenger and swaps upward.` };
    }
    return { ...rule, movement: "none", text: rule.reason };
  }

  function applyMovement(challengerId, defenderId, movement) {
    const c = state.ladder.indexOf(challengerId);
    const d = state.ladder.indexOf(defenderId);
    if (c < 0 || d < 0) return;
    if (movement === "swap") {
      [state.ladder[c], state.ladder[d]] = [state.ladder[d], state.ladder[c]];
    }
    if (movement === "pushDown") {
      const below = d + 1;
      if (below < state.ladder.length) [state.ladder[d], state.ladder[below]] = [state.ladder[below], state.ladder[d]];
    }
  }

  function fmtDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function render() {
    renderMetrics(); renderLeaderboard(); renderMatrix(); renderMatchForm(); renderHistory(); renderAwards(); renderRules(); renderPlayers(); renderSyncForm();
  }

  function renderMetrics() {
    const stats = statsByPlayer();
    const totalMatches = state.matches.length;
    const leader = state.ladder[0] ? name(state.ladder[0]) : "-";
    const active = activePlayers().length;
    const mostActive = [...stats.entries()].sort((a,b) => b[1].played - a[1].played)[0];
    $("#metrics").innerHTML = [
      [leader, "Current leader"], [active, "Active players"], [totalMatches, "Matches logged"], [mostActive && mostActive[1].played ? `${name(mostActive[0])}` : "-", "Most active"]
    ].map(([a,b]) => `<div class="metric"><strong>${esc(a)}</strong><span>${esc(b)}</span></div>`).join("");
  }

  function renderLeaderboard() {
    const stats = statsByPlayer();
    const html = state.ladder.map((id, i) => {
      const p = player(id); if (!p) return "";
      const s = stats.get(id) || {};
      const streakCls = s.streak > 0 ? "win" : s.streak < 0 ? "loss" : "";
      const streak = s.streak > 0 ? `+${s.streak}` : `${s.streak || 0}`;
      return `<div class="player-card">
        <div class="rank">#${i + 1}</div>
        <div><div class="name">${esc(p.name)}</div><div class="meta">${s.wins || 0}W - ${s.losses || 0}L - ${s.played || 0} played - Last: ${fmtDate(s.lastPlayed)}</div></div>
        <div class="streak ${streakCls}">Streak ${streak}</div>
      </div>`;
    }).join("");
    $("#leaderboard").innerHTML = html || `<div class="empty">No players yet.</div>`;
  }

  function renderMatrix() {
    const cards = activePlayers().map(p => {
      const allowed = allowedDefenders(p.id);
      const chips = allowed.length ? allowed.map(d => `<span class="tag">#${rankOf(d.id)} ${esc(d.name)}</span>`).join("") : `<span class="tag">No legal challenge</span>`;
      return `<div class="matrix-card"><strong>#${rankOf(p.id)} ${esc(p.name)}</strong><div class="mini-list">${chips}</div></div>`;
    }).join("");
    $("#challengeMatrix").innerHTML = cards || `<div class="empty">Add players to see valid challenges.</div>`;
  }

  function renderMatchForm() {
    const cSel = $("#challengerSelect"), dSel = $("#defenderSelect"), wSel = $("#winnerSelect");
    const currentC = cSel.value || state.ladder[1] || state.ladder[0] || "";
    cSel.innerHTML = activePlayers().map(p => `<option value="${esc(p.id)}">#${rankOf(p.id)} - ${esc(p.name)}</option>`).join("");
    cSel.value = state.ladder.includes(currentC) ? currentC : (state.ladder[0] || "");
    const defenders = activePlayers().filter(p => p.id !== cSel.value);
    const currentD = dSel.value || allowedDefenders(cSel.value)[0]?.id || defenders[0]?.id || "";
    dSel.innerHTML = defenders.map(p => `<option value="${esc(p.id)}">#${rankOf(p.id)} - ${esc(p.name)}</option>`).join("");
    dSel.value = defenders.some(p => p.id === currentD) ? currentD : (defenders[0]?.id || "");
    wSel.innerHTML = [cSel.value, dSel.value].filter(Boolean).map(id => `<option value="${esc(id)}">${esc(name(id))}</option>`).join("");
    if (![cSel.value, dSel.value].includes(wSel.value)) wSel.value = cSel.value;
    updateMatchPreview();
  }

  function updateMatchPreview() {
    const c = $("#challengerSelect").value, d = $("#defenderSelect").value, w = $("#winnerSelect").value;
    const rule = movementFor(c, d, w);
    const pill = $("#matchValidity");
    pill.className = `status-pill ${rule.allowed ? "ok" : "bad"}`;
    pill.textContent = rule.allowed ? "Valid challenge" : "Invalid challenge";
    $("#movementPreview").innerHTML = `<strong>${esc(rule.movement.toUpperCase())}</strong><br>${esc(rule.text)}<br><span class="muted">${esc(rule.reason)}</span>`;
  }

  function renderHistory() {
    const html = [...state.matches].sort((a,b) => new Date(b.date) - new Date(a.date)).map(m => {
      return `<div class="history-card">
        <div><strong>${esc(name(m.challengerId))} vs ${esc(name(m.defenderId))}</strong><div class="meta">${fmtDate(m.date)} - ${esc(name(m.winnerId))} won ${esc(m.score)}${m.notes ? ` - ${esc(m.notes)}` : ""}</div><span class="tag">${esc(m.direction)}</span><span class="tag">${esc(m.movement)}</span></div>
        <button class="btn small danger" data-delete-match="${esc(m.id)}">Delete</button>
      </div>`;
    }).join("");
    $("#matchHistory").innerHTML = html || `<div class="empty">No matches logged yet.</div>`;
  }

  function topBy(stats, key) {
    return [...stats.entries()].filter(([,s]) => (s[key] || 0) > 0).sort((a,b) => b[1][key] - a[1][key])[0];
  }

  function renderAwards() {
    const stats = statsByPlayer();
    const awards = [
      ["Ladder Champion", state.ladder[0] ? name(state.ladder[0]) : "-", "Rank #1 right now"],
      ["Most Wins", topBy(stats, "wins") ? `${name(topBy(stats, "wins")[0])} (${topBy(stats, "wins")[1].wins})` : "-", "Most recorded wins"],
      ["Best Streak", [...stats.entries()].sort((a,b) => b[1].streak - a[1].streak)[0] ? `${name([...stats.entries()].sort((a,b) => b[1].streak - a[1].streak)[0][0])} (${[...stats.entries()].sort((a,b) => b[1].streak - a[1].streak)[0][1].streak || 0})` : "-", "Current streak"],
      ["Giant Killer", topBy(stats, "giantKills") ? `${name(topBy(stats, "giantKills")[0])} (${topBy(stats, "giantKills")[1].giantKills})` : "-", "Wins from two ranks below"],
      ["Bully", topBy(stats, "pushDownWins") ? `${name(topBy(stats, "pushDownWins")[0])} (${topBy(stats, "pushDownWins")[1].pushDownWins})` : "-", "Successful push-down wins"],
      ["Grinder", topBy(stats, "played") ? `${name(topBy(stats, "played")[0])} (${topBy(stats, "played")[1].played})` : "-", "Most matches played"]
    ];
    $("#awards").innerHTML = awards.map(a => `<div class="award-card"><strong>${esc(a[1])}</strong><div class="name">${esc(a[0])}</div><div class="meta">${esc(a[2])}</div></div>`).join("");
  }

  function renderRules() {
    const s = state.settings;
    const rules = [
      ["Challenge up", `A player can challenge up to ${s.challengeUpLimit} ranks above them.`],
      ["Push-down", `A player can challenge ${s.pushDownLimit} rank below them to keep movement active.`],
      ["No repeat spam", s.blockBackToBack ? "The same opponent cannot be challenged back-to-back." : "Back-to-back repeat challenges are allowed."],
      ["Match format", "Best of 3. The app records the final game score as 2-0, 2-1, 0-2, or 1-2."],
      ["Upward movement", "If the challenger beats a higher-ranked defender, they swap. If the defender wins, no movement."],
      ["Push-down movement", "If the higher-ranked challenger wins, the defender drops one spot. If the lower-ranked defender wins, they swap upward."],
      ["Inactivity", `${s.inactiveDropOneDays}+ days drops one rank, ${s.inactiveDropTwoDays}+ days drops two ranks, ${s.inactiveDropBottomDays}+ days drops to bottom when Apply inactivity is pressed.`]
    ];
    $("#rules").innerHTML = rules.map(([t,b]) => `<div class="rule-card"><b>${esc(t)}</b><br>${esc(b)}</div>`).join("");
  }

  function renderPlayers() {
    $("#playerManager").innerHTML = state.ladder.map((id, i) => {
      const p = player(id); if (!p) return "";
      return `<div class="manager-row player-card"><span class="rank">#${i + 1}</span><input value="${esc(p.name)}" data-rename="${esc(id)}" /><button class="icon-btn" data-move-up="${esc(id)}">↑</button><button class="icon-btn" data-move-down="${esc(id)}">↓</button></div>`;
    }).join("") || `<div class="empty">No players yet.</div>`;
  }

  function renderSyncForm() {
    const target = `${GITHUB_SYNC_TARGET.owner}/${GITHUB_SYNC_TARGET.repo}:${GITHUB_SYNC_TARGET.branch}/${GITHUB_SYNC_TARGET.path}`;
    const label = $("#syncTargetLabel");
    if (label) label.textContent = target;
    const token = $("#syncToken");
    if (token) token.value = syncSettings.token || "";
  }

  function switchTab(tab) {
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${tab}`));
    if (tab === "match") renderMatchForm();
  }

  function saveMatch() {
    const c = $("#challengerSelect").value, d = $("#defenderSelect").value, w = $("#winnerSelect").value;
    const score = $("#scoreSelect").value;
    const notes = $("#matchNotes").value.trim();
    const move = movementFor(c, d, w);
    if (!move.allowed) return toast(`Cannot save: ${move.reason}`, "bad");
    const match = { id: uid("m"), date: new Date().toISOString(), challengerId: c, defenderId: d, winnerId: w, score, notes, allowed: move.allowed, direction: move.direction, challengeDistance: move.challengeDistance, movement: move.movement };
    state.matches.push(match);
    applyMovement(c, d, move.movement);
    saveState();
    $("#matchNotes").value = "";
    toast("Match saved and ladder updated.", "ok");
    render();
    switchTab("dashboard");
  }

  function addPlayer() {
    const input = $("#newPlayerName");
    const nm = input.value.trim();
    if (!nm) return toast("Enter a player name.", "bad");
    if (state.players.some(p => p.name.toLowerCase() === nm.toLowerCase())) return toast("That player already exists.", "bad");
    const id = uid("p");
    state.players.push({ id, name: nm, active: true });
    state.ladder.push(id);
    input.value = "";
    saveState(); render(); toast(`${nm} added at the bottom.`, "ok");
  }

  function replaceRoster() {
    const names = $("#bulkRoster").value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return toast("Paste at least one name.", "bad");
    if (!confirm("Replace the current roster and clear match history?")) return;
    state.players = names.map(n => ({ id: uid("p"), name: n, active: true }));
    state.ladder = state.players.map(p => p.id);
    state.matches = [];
    state.season = { name: `Season ${new Date().toLocaleDateString()}`, startedAt: new Date().toISOString() };
    $("#bulkRoster").value = "";
    saveState(); render(); toast("Roster replaced and season reset.", "ok");
  }

  function startNewSeason() {
    if (!confirm("Start a new season? This clears match history but keeps the current ladder order.")) return;
    state.matches = [];
    state.season = { name: `Season ${new Date().toLocaleDateString()}`, startedAt: new Date().toISOString() };
    saveState(); render(); toast("New season started.", "ok");
  }

  function applyInactivity() {
    const stats = statsByPlayer();
    const now = Date.now();
    const moves = [];
    for (const id of [...state.ladder]) {
      const last = stats.get(id)?.lastPlayed;
      if (!last) continue;
      const days = Math.floor((now - new Date(last).getTime()) / 86400000);
      let toBottom = false, drop = 0;
      if (days >= state.settings.inactiveDropBottomDays) toBottom = true;
      else if (days >= state.settings.inactiveDropTwoDays) drop = 2;
      else if (days >= state.settings.inactiveDropOneDays) drop = 1;
      if (toBottom || drop) moves.push({ id, toBottom, drop, days });
    }
    if (!moves.length) return toast("No inactivity drops needed.");
    for (const m of moves.sort((a,b) => rankOf(b.id) - rankOf(a.id))) {
      const i = state.ladder.indexOf(m.id);
      const [removed] = state.ladder.splice(i, 1);
      const target = m.toBottom ? state.ladder.length : Math.min(i + m.drop, state.ladder.length);
      state.ladder.splice(target, 0, removed);
    }
    saveState(); render(); toast(`Applied ${moves.length} inactivity movement(s).`, "ok");
  }

  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ping-pong-state-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  async function importState(file) {
    if (!file) return;
    try {
      state = normalize(JSON.parse(await file.text()));
      saveState(); render(); toast("State imported.", "ok");
    } catch (err) { toast(`Import failed: ${err.message}`, "bad"); }
  }

  async function githubRequest(method, body) {
    const { owner, repo, branch, path, token } = syncSettings;
    if (!owner || !repo || !path || !token) throw new Error("Missing GitHub sync settings.");
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`;
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `GitHub ${method} failed`);
    return data;
  }

  async function pullGithub() {
    try {
      $("#syncStatus").textContent = "Pulling from GitHub...";
      const data = await githubRequest("GET");
      const decoded = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))));
      state = normalize(decoded); saveState(); render();
      $("#syncStatus").textContent = `Pulled ${syncSettings.path}.`;
      toast("Pulled state from GitHub.", "ok");
    } catch (err) { $("#syncStatus").textContent = err.message; toast(err.message, "bad"); }
  }

  async function pushGithub() {
    try {
      $("#syncStatus").textContent = "Preparing commit...";
      let sha = undefined;
      try { sha = (await githubRequest("GET")).sha; } catch {}
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2))));
      const body = { message: `Update ping pong ladder ${new Date().toISOString()}`, content, branch: syncSettings.branch || "main", ...(sha ? { sha } : {}) };
      await githubRequest("PUT", body);
      $("#syncStatus").textContent = `Pushed ${syncSettings.path}.`;
      toast("Pushed state to GitHub.", "ok");
    } catch (err) { $("#syncStatus").textContent = err.message; toast(err.message, "bad"); }
  }

  document.addEventListener("click", e => {
    const tab = e.target.closest("[data-tab]"); if (tab) return switchTab(tab.dataset.tab);
    const open = e.target.closest("[data-open-panel]"); if (open) return switchTab(open.dataset.openPanel);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "save-match") saveMatch();
    if (action === "reset-match-form") { $("#matchNotes").value = ""; renderMatchForm(); }
    if (action === "add-player") addPlayer();
    if (action === "replace-roster") replaceRoster();
    if (action === "new-season") startNewSeason();
    if (action === "apply-inactivity") applyInactivity();
    if (action === "export-state") exportState();
    if (action === "factory-reset" && confirm("Reset this browser to the default demo state?")) { state = normalize(DEFAULT_STATE); saveState(); render(); toast("Factory reset complete.", "ok"); }
    if (action === "clear-matches" && confirm("Clear all match history?")) { state.matches = []; saveState(); render(); toast("Match history cleared.", "ok"); }
    if (action === "open-sync") switchTab("settings");
    if (action === "save-sync-settings") { syncSettings = { ...GITHUB_SYNC_TARGET, token: $("#syncToken").value.trim() }; saveSyncSettings(); toast("Admin token saved locally.", "ok"); }
    if (action === "pull-github") pullGithub();
    if (action === "push-github") pushGithub();
    const del = e.target.closest("[data-delete-match]")?.dataset.deleteMatch;
    if (del && confirm("Delete this match? Ladder order will not be replayed automatically; use only for recent mistakes.")) { state.matches = state.matches.filter(m => m.id !== del); saveState(); render(); }
    const up = e.target.closest("[data-move-up]")?.dataset.moveUp;
    if (up) { const i = state.ladder.indexOf(up); if (i > 0) [state.ladder[i-1], state.ladder[i]] = [state.ladder[i], state.ladder[i-1]]; saveState(); render(); }
    const down = e.target.closest("[data-move-down]")?.dataset.moveDown;
    if (down) { const i = state.ladder.indexOf(down); if (i >= 0 && i < state.ladder.length - 1) [state.ladder[i+1], state.ladder[i]] = [state.ladder[i], state.ladder[i+1]]; saveState(); render(); }
  });

  document.addEventListener("input", e => {
    if (["challengerSelect", "defenderSelect", "winnerSelect"].includes(e.target.id)) renderMatchForm();
    const rename = e.target.dataset.rename;
    if (rename) { const p = player(rename); if (p) { p.name = e.target.value.trim() || p.name; saveState(); renderMetrics(); renderLeaderboard(); renderMatrix(); renderAwards(); } }
  });
  $("#importFile").addEventListener("change", e => importState(e.target.files[0]));

  saveState();
  render();
})();
