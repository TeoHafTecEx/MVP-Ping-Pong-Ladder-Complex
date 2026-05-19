(() => {
  "use strict";

  const STORAGE_KEY = "pp_ladder_v2_state";
  const SYNC_KEY = "pp_ladder_v2_github_sync";

  // Hardcoded GitHub sync target. Token is NEVER stored here — each user pastes it once.
  const GITHUB_SYNC_TARGET = {
    owner: "TeoHafTecEx",
    repo: "MVP-Ping-Pong-Ladder-Complex",
    branch: "main",
    path: "data/state.json"
  };

  const DEFAULT_STATE = {
    version: 2,
    season: { name: "Season 2026", startedAt: new Date().toISOString() },
    settings: {
      challengeUpLimit: 2,
      pushDownLimit: 1,
      blockBackToBack: true,
      inactiveDropOneDays: 7,
      inactiveDropTwoDays: 14,
      inactiveDropBottomDays: 21,
      doublesMinGames: 3
    },
    players: [
      { id: "p_seed_01", name: "Daniel P", active: true },
      { id: "p_seed_02", name: "Tashan C", active: true },
      { id: "p_seed_03", name: "Chanro DT", active: true },
      { id: "p_seed_04", name: "Aharon Z", active: true },
      { id: "p_seed_05", name: "Teo H", active: true },
      { id: "p_seed_06", name: "Kate P", active: true },
      { id: "p_seed_07", name: "Didi K", active: true },
      { id: "p_seed_08", name: "Daleen L", active: true },
      { id: "p_seed_09", name: "Juandre J", active: true }
    ],
    ladder: ["p_seed_01","p_seed_02","p_seed_03","p_seed_04","p_seed_05","p_seed_06","p_seed_07","p_seed_08","p_seed_09"],
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
    try {
      const saved = JSON.parse(localStorage.getItem(SYNC_KEY)) || {};
      return { ...GITHUB_SYNC_TARGET, token: saved.token || "" };
    } catch {
      return { ...GITHUB_SYNC_TARGET, token: "" };
    }
  }

  function saveSyncSettings() {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ token: syncSettings.token || "" }));
  }

  function hasToken() {
    return !!(syncSettings && syncSettings.token && syncSettings.token.trim());
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
    const sorted = [...state.matches].filter(m => m.type !== "doubles").sort((a, b) => new Date(a.date) - new Date(b.date));
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

  // Canonical pair key — always sorted so A+B === B+A
  function pairKey(id1, id2) { return [id1, id2].sort().join(":"); }

  function statsByPair() {
    const map = new Map();
    const sorted = [...state.matches].filter(m => m.type === "doubles").sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const m of sorted) {
      if (!m.challengerIds || !m.defenderIds || !m.winnerTeam) continue;
      const teams = [
        { ids: m.challengerIds, won: m.winnerTeam === "challenger" },
        { ids: m.defenderIds,   won: m.winnerTeam === "defender"   }
      ];
      for (const { ids, won } of teams) {
        const key = pairKey(ids[0], ids[1]);
        if (!map.has(key)) map.set(key, { ids, wins: 0, losses: 0, played: 0, lastPlayed: "" });
        const s = map.get(key);
        s.played++; s.lastPlayed = m.date;
        if (won) s.wins++; else s.losses++;
      }
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
    renderMetrics(); renderLeaderboard(); renderBattles(); renderMatchForm(); renderHistory(); renderDoubles(); renderAwards(); renderRules(); renderPlayers(); renderSyncForm();
  }

  function renderMetrics() {
    const stats = statsByPlayer();
    const totalMatches = state.matches.length;
    const leader = state.ladder[0] ? name(state.ladder[0]) : "-";
    const active = activePlayers().length;
    const mostActive = [...stats.entries()].sort((a,b) => b[1].played - a[1].played)[0];
    const items = [
      [leader, "Current leader", "c-pink"],
      [active, "Active players", "c-blue"],
      [totalMatches, "Matches logged", ""],
      [mostActive && mostActive[1].played ? name(mostActive[0]) : "-", "Most active", ""]
    ];
    $("#metrics").innerHTML = items.map(([a,b,cls]) => `<div class="metric"><strong class="${cls}">${esc(a)}</strong><span>${esc(b)}</span></div>`).join("");
  }

  function rankClass(i) {
    return ["rank-1","rank-2","rank-3","rank-4"][i] || "rank-n";
  }

  function avatarClass(i) {
    return ["ba-pink","ba-blue","ba-purple","ba-green"][i] || "ba-gray";
  }

  function buildPips(matches, playerId) {
    const recent = [...matches]
      .sort((a,b) => new Date(b.date) - new Date(a.date))
      .filter(m => m.challengerId === playerId || m.defenderId === playerId)
      .slice(0, 5)
      .reverse();
    return recent.map((m, idx) => {
      const won = m.winnerId === playerId;
      return `<div class="pip ${won ? "w" : "l"}" style="animation-delay:${idx * 60}ms"></div>`;
    }).join("");
  }

  function renderLeaderboard() {
    const stats = statsByPlayer();
    const header = `<div class="sb-col-head">
      <span>#</span><span>Player</span>
      <span class="center">W</span><span class="center">L</span>
      <span class="right">Streak</span>
    </div>`;
    const rows = state.ladder.map((id, i) => {
      const p = player(id); if (!p) return "";
      const s = stats.get(id) || {};
      const streakCls = s.streak > 0 ? "win" : s.streak < 0 ? "loss" : "";
      const streakLabel = s.streak > 0 ? `+${s.streak} ↑` : s.streak < 0 ? `${s.streak} ↓` : `0`;
      const pips = buildPips(state.matches, id);
      const initials = esc(p.name.slice(0,2).toUpperCase());
      return `<div class="player-card" data-player-id="${esc(id)}">
        <div class="rank ${rankClass(i)}">${i + 1}</div>
        <div class="player-info">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">Last: ${fmtDate(s.lastPlayed)}</div>
        </div>
        <div class="stat-w">${s.wins || 0}</div>
        <div class="stat-l">${s.losses || 0}</div>
        <div class="streak-cell">
          <span class="streak ${streakCls}">${streakLabel}</span>
          <div class="streak-pips">${pips}</div>
        </div>
        <button class="quick-challenge" data-quick-challenge="${esc(id)}">Challenge →</button>
      </div>`;
    }).join("");
    $("#leaderboard").innerHTML = header + (rows || `<div class="empty">No players yet.</div>`);
  }

  function renderMatrix() {
    // kept for JS compat but output goes to challengeMatrix which is hidden
    renderBattles();
  }

  function battleContext(challenger, defender, stats) {
    const cs = stats.get(challenger.id) || {};
    const ds = stats.get(defender.id) || {};
    const cRank = rankOf(challenger.id);
    const dRank = rankOf(defender.id);
    const upward = cRank > dRank;
    const msgs = [];
    if (ds.streak <= -2) msgs.push(`${esc(defender.name)} is on a ${ds.streak} cold streak — now's the moment.`);
    if (cs.streak >= 2) msgs.push(`${esc(challenger.name)} is on fire with +${cs.streak} in a row.`);
    if (upward && Math.abs(cRank - dRank) >= 2) msgs.push(`Giant-killer opportunity — ${esc(challenger.name)} is 2 ranks below.`);
    if (!msgs.length) msgs.push(`${esc(challenger.name)} vs #${dRank} ${esc(defender.name)} — a legal challenge.`);
    const spicy = ds.streak <= -2 || cs.streak >= 2;
    return { text: msgs[0], spicy };
  }

  function renderBattles() {
    const players = activePlayers();
    const stats = statsByPlayer();
    if (players.length < 2) {
      $("#challengeMatrix").innerHTML = `<div class="empty">Add at least two players to see matchups.</div>`;
      return;
    }

    // Build all valid matchups scored by interestingness
    const matchups = [];
    for (const c of players) {
      for (const d of allowedDefenders(c.id)) {
        const cs = stats.get(c.id) || {};
        const ds = stats.get(d.id) || {};
        let score = 0;
        if (ds.streak <= -2) score += 3;
        if (cs.streak >= 2) score += 2;
        const dist = Math.abs((rankOf(c.id) || 0) - (rankOf(d.id) || 0));
        if (dist >= 2) score += 2;
        score += (cs.played || 0) + (ds.played || 0);
        matchups.push({ c, d, score });
      }
    }
    matchups.sort((a,b) => b.score - a.score);
    // dedupe — each player appears at most once as challenger in top cards
    const seen = new Set();
    const top = [];
    for (const m of matchups) {
      if (!seen.has(m.c.id)) { top.push(m); seen.add(m.c.id); }
      if (top.length >= 3) break;
    }
    if (!top.length) {
      $("#challengeMatrix").innerHTML = `<div class="empty">No legal challenges available right now.</div>`;
      return;
    }

    const avatarColors = ["ba-pink","ba-blue","ba-purple","ba-green","ba-gray"];
    const avatarFor = (p) => avatarColors[state.ladder.indexOf(p.id)] || "ba-gray";

    const cards = top.map(({ c, d }) => {
      const ctx = battleContext(c, d, stats);
      const cInit = esc(c.name.slice(0,2).toUpperCase());
      const dInit = esc(d.name.slice(0,2).toUpperCase());
      const cRank = rankOf(c.id);
      const dRank = rankOf(d.id);
      return `<div class="battle-card" data-battle-c="${esc(c.id)}" data-battle-d="${esc(d.id)}">
        <div class="battle-vs">
          <div class="battle-player">
            <div class="battle-avatar ${avatarFor(c)}">${cInit}</div>
            <div class="battle-pname">${esc(c.name)}</div>
            <div class="battle-rank-label">Rank #${cRank}</div>
          </div>
          <div class="battle-vs-badge">VS</div>
          <div class="battle-player">
            <div class="battle-avatar ${avatarFor(d)}">${dInit}</div>
            <div class="battle-pname">${esc(d.name)}</div>
            <div class="battle-rank-label">Rank #${dRank}</div>
          </div>
        </div>
        <div class="battle-context ${ctx.spicy ? "spicy" : "cold"}">${ctx.text}</div>
        <button class="battle-cta" data-battle-c="${esc(c.id)}" data-battle-d="${esc(d.id)}">Set this up →</button>
      </div>`;
    }).join("");
    $("#challengeMatrix").innerHTML = cards;
  }

  // ── Visual match wizard state ──
  let matchWiz = { mode: "singles", challenger: null, defender: null, challengers: [], defenders: [], winner: null, score: null };

  const AVATAR_CLASSES = ["ba-pink","ba-blue","ba-purple","ba-green","ba-gray"];
  function avatarCls(id) { return AVATAR_CLASSES[state.ladder.indexOf(id)] || "ba-gray"; }

  function matchWizReset() {
    matchWiz = { mode: matchWiz.mode, challenger: null, defender: null, challengers: [], defenders: [], winner: null, score: null };
    renderMatchForm();
  }

  function matchWizSetMode(mode) {
    matchWiz = { mode, challenger: null, defender: null, challengers: [], defenders: [], winner: null, score: null };
    renderMatchForm();
  }

  function matchWizSetChallenger(id) {
    if (matchWiz.mode === "doubles") {
      const arr = matchWiz.challengers.includes(id)
        ? matchWiz.challengers.filter(x => x !== id)
        : matchWiz.challengers.length < 2 ? [...matchWiz.challengers, id] : matchWiz.challengers;
      matchWiz.challengers = arr;
      matchWiz.defenders = [];
      matchWiz.winner = null;
      matchWiz.score = null;
    } else {
      matchWiz.challenger = id;
      matchWiz.defender = null;
      matchWiz.winner = null;
      matchWiz.score = null;
      const cSel = $("#challengerSelect");
      cSel.innerHTML = activePlayers().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      cSel.value = id;
    }
    renderMatchForm();
  }

  function matchWizSetDefender(id) {
    if (matchWiz.mode === "doubles") {
      const arr = matchWiz.defenders.includes(id)
        ? matchWiz.defenders.filter(x => x !== id)
        : matchWiz.defenders.length < 2 ? [...matchWiz.defenders, id] : matchWiz.defenders;
      matchWiz.defenders = arr;
      matchWiz.winner = null;
      matchWiz.score = null;
    } else {
      matchWiz.defender = id;
      matchWiz.winner = null;
      matchWiz.score = null;
      const dSel = $("#defenderSelect");
      dSel.innerHTML = activePlayers().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      dSel.value = id;
      const wSel = $("#winnerSelect");
      wSel.innerHTML = [matchWiz.challenger, id].map(pid => `<option value="${esc(pid)}">${esc(name(pid))}</option>`).join("");
      wSel.value = matchWiz.challenger;
    }
    renderMatchForm();
  }

  function matchWizSetWinner(id) {
    // In doubles, id is "challenger" or "defender" (team token). In singles, it's a player id.
    matchWiz.winner = id;
    matchWiz.score = null;
    if (matchWiz.mode !== "doubles") {
      const wSel = $("#winnerSelect");
      if (wSel) wSel.value = id;
    }
    renderMatchForm();
  }

  function matchWizSetScore(score) {
    matchWiz.score = score;
    $("#scoreSelect").value = score;
    renderMatchForm();
  }

  function renderMatchForm() {
    const players = activePlayers();
    const { mode, challenger, defender, challengers, defenders, winner, score } = matchWiz;
    const isDoubles = mode === "doubles";

    // Sync mode toggle buttons
    $$("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));

    // Step labels
    const lbl1 = $("#matchStep1Label"), lbl2 = $("#matchStep2Label");
    if (lbl1) lbl1.textContent = isDoubles ? "Pick your team (2 players)" : "Who is challenging?";
    if (lbl2) lbl2.textContent = isDoubles ? "Pick the opposing team (2 players)" : "Who are they challenging?";

    const step1 = $("#matchStep1"), step2 = $("#matchStep2"), step3 = $("#matchStep3");
    if (!step1) return;

    // ── Step 1: challenger(s) picker ──
    const grid1 = $("#matchPlayerGrid");
    if (grid1) {
      if (isDoubles) {
        grid1.innerHTML = players.map(p => {
          const selected = challengers.includes(p.id);
          const takenByOther = defenders.includes(p.id);
          return `<button class="match-pick-btn ${selected ? "selected" : ""} ${takenByOther ? "disabled-pick" : ""}"
            data-wiz-challenger="${esc(p.id)}" ${takenByOther ? 'title="Already on opposing team"' : ""}>
            <div class="match-pick-avatar ${avatarCls(p.id)}">${esc(p.name.slice(0,2).toUpperCase())}</div>
            <div class="match-pick-name">${esc(p.name)}</div>
            <div class="match-pick-rank">#${rankOf(p.id)}</div>
            ${selected ? `<div class="match-pick-check">✓</div>` : ""}
          </button>`;
        }).join("");
      } else {
        grid1.innerHTML = players.map(p => {
          const selected = challenger === p.id;
          return `<button class="match-pick-btn ${selected ? "selected" : ""}" data-wiz-challenger="${esc(p.id)}">
            <div class="match-pick-avatar ${avatarCls(p.id)}">${esc(p.name.slice(0,2).toUpperCase())}</div>
            <div class="match-pick-name">${esc(p.name)}</div>
            <div class="match-pick-rank">#${rankOf(p.id)}</div>
          </button>`;
        }).join("");
      }
    }

    // ── Step 2: defender(s) picker ──
    const hasChallenger = isDoubles ? challengers.length === 2 : !!challenger;
    if (hasChallenger) {
      step2.style.display = "block";
      const grid2 = $("#matchDefenderGrid");
      if (grid2) {
        if (isDoubles) {
          grid2.innerHTML = players.map(p => {
            const selected = defenders.includes(p.id);
            const takenByChallenger = challengers.includes(p.id);
            return `<button class="match-pick-btn ${selected ? "selected" : ""} ${takenByChallenger ? "disabled-pick" : ""}"
              data-wiz-defender="${esc(p.id)}" ${takenByChallenger ? 'title="Already on challenger team"' : ""}>
              <div class="match-pick-avatar ${avatarCls(p.id)}">${esc(p.name.slice(0,2).toUpperCase())}</div>
              <div class="match-pick-name">${esc(p.name)}</div>
              <div class="match-pick-rank">#${rankOf(p.id)}</div>
              ${selected ? `<div class="match-pick-check">✓</div>` : ""}
            </button>`;
          }).join("");
        } else {
          const allowed = allowedDefenders(challenger);
          const allOthers = players.filter(p => p.id !== challenger);
          grid2.innerHTML = allOthers.map(p => {
            const isAllowed = allowed.some(a => a.id === p.id);
            const selected = defender === p.id;
            const rule = challengeRule(challenger, p.id);
            return `<button class="match-pick-btn ${selected ? "selected" : ""} ${!isAllowed ? "disabled-pick" : ""}"
              data-wiz-defender="${esc(p.id)}" ${!isAllowed ? 'title="' + esc(rule.reason) + '"' : ""}>
              <div class="match-pick-avatar ${avatarCls(p.id)}">${esc(p.name.slice(0,2).toUpperCase())}</div>
              <div class="match-pick-name">${esc(p.name)}</div>
              <div class="match-pick-rank">#${rankOf(p.id)}</div>
              ${!isAllowed ? `<div class="match-pick-block">${esc(rule.reason)}</div>` : ""}
            </button>`;
          }).join("");
        }
      }
    } else {
      step2.style.display = "none";
    }

    // ── Step 3: arena ──
    const hasDefender = isDoubles ? defenders.length === 2 : !!defender;
    if (hasChallenger && hasDefender) {
      step3.style.display = "block";

      if (isDoubles) {
        // Doubles arena — two avatars per side
        const teamLabel = (ids) => ids.map(id => name(id)).join(" & ");
        const teamInits = (ids) => ids.map(id => `<div class="match-arena-avatar ${avatarCls(id)}" style="width:42px;height:42px;font-size:.8rem">${esc(name(id).slice(0,2).toUpperCase())}</div>`).join("");
        const cWon = winner === "challenger", dWon = winner === "defender";
        const cCls = `match-arena-player${cWon ? " winner-selected" : ""}${winner && !cWon ? " loser-dim" : ""}`;
        const dCls = `match-arena-player${dWon ? " winner-selected" : ""}${winner && !dWon ? " loser-dim" : ""}`;
        $("#matchArena").innerHTML = `
          <div class="${cCls}" id="arenaLeft" data-wiz-winner="challenger">
            <div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px">${teamInits(challengers)}</div>
            <div class="match-arena-name" style="font-size:.88rem">${esc(teamLabel(challengers))}</div>
            <div class="match-arena-rank">Team A</div>
            <div class="match-winner-btn${cWon ? " picked" : ""}">${cWon ? "✓ Winners" : "Tap to pick winner"}</div>
          </div>
          <div class="match-arena-vs">VS</div>
          <div class="${dCls}" id="arenaRight" data-wiz-winner="defender">
            <div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px">${teamInits(defenders)}</div>
            <div class="match-arena-name" style="font-size:.88rem">${esc(teamLabel(defenders))}</div>
            <div class="match-arena-rank">Team B</div>
            <div class="match-winner-btn${dWon ? " picked" : ""}">${dWon ? "✓ Winners" : "Tap to pick winner"}</div>
          </div>`;
        // Rule msg — not applicable for doubles
        const ruleMsg = $("#matchRuleMsg");
        if (ruleMsg) ruleMsg.style.display = "none";
      } else {
        // Singles arena (original logic)
        const rule = challengeRule(challenger, defender);
        const setArena = (side, id) => {
          const av = $(`#arena${side}Avatar`), nm = $(`#arena${side}Name`), rk = $(`#arena${side}Rank`), wb = $(`#arena${side}Win`);
          const el = $(`#arena${side}`);
          if (!av) return;
          av.className = `match-arena-avatar ${avatarCls(id)}`;
          av.textContent = name(id).slice(0,2).toUpperCase();
          nm.textContent = name(id);
          rk.textContent = `Rank #${rankOf(id)}`;
          const isWinner = winner === id;
          el.className = `match-arena-player${isWinner ? " winner-selected" : ""}${winner && !isWinner ? " loser-dim" : ""}`;
          wb.textContent = isWinner ? "✓ Winner" : "Tap to pick winner";
          wb.className = `match-winner-btn${isWinner ? " picked" : ""}`;
        };
        // Rebuild singles arena HTML if it was replaced by doubles
        if (!$("#arenaLeftAvatar")) {
          $("#matchArena").innerHTML = `
            <div class="match-arena-player" id="arenaLeft" data-wiz-winner="">
              <div class="match-arena-avatar" id="arenaLeftAvatar"></div>
              <div class="match-arena-name" id="arenaLeftName"></div>
              <div class="match-arena-rank" id="arenaLeftRank"></div>
              <div class="match-winner-btn" id="arenaLeftWin">Tap to pick winner</div>
            </div>
            <div class="match-arena-vs">VS</div>
            <div class="match-arena-player" id="arenaRight" data-wiz-winner="">
              <div class="match-arena-avatar" id="arenaRightAvatar"></div>
              <div class="match-arena-name" id="arenaRightName"></div>
              <div class="match-arena-rank" id="arenaRightRank"></div>
              <div class="match-winner-btn" id="arenaRightWin">Tap to pick winner</div>
            </div>`;
        }
        setArena("Left", challenger);
        setArena("Right", defender);
        $(`#arenaLeft`).dataset.wizWinner = challenger;
        $(`#arenaRight`).dataset.wizWinner = defender;
        const ruleMsg = $("#matchRuleMsg");
        if (!rule.allowed) {
          ruleMsg.style.display = "block";
          ruleMsg.className = "match-rule-msg invalid";
          ruleMsg.textContent = "⚠ " + rule.reason;
        } else {
          ruleMsg.style.display = "none";
        }
      }

      // ── Score picker ──
      const scorePicker = $("#matchScorePicker");
      const scoreBtns = $("#matchScoreBtns");
      const hasWinner = isDoubles ? !!winner : !!winner;
      const ruleAllowed = isDoubles ? true : challengeRule(challenger, defender).allowed;

      if (hasWinner && ruleAllowed) {
        scorePicker.style.display = "block";
        let isChallWin;
        if (isDoubles) {
          isChallWin = winner === "challenger";
        } else {
          isChallWin = winner === challenger;
        }
        const scores = isChallWin ? [["2-0","2–0 (dominant)"],["2-1","2–1 (close)"]] : [["0-2","0–2 (dominant)"],["1-2","1–2 (close)"]];
        scoreBtns.innerHTML = scores.map(([val, label]) =>
          `<button class="match-score-opt${score === val ? " selected" : ""}" data-wiz-score="${esc(val)}">${esc(label)}</button>`
        ).join("");
      } else {
        scorePicker.style.display = "none";
      }

      // ── Notes + save ──
      const notesRow = $("#matchNotesRow"), saveRow = $("#matchSaveRow");
      const canSave = hasWinner && score && ruleAllowed;
      if (canSave) {
        notesRow.style.display = "block";
        saveRow.style.display = "block";
        const prev = $("#matchMovementPreview");
        if (prev) {
          if (isDoubles) {
            const wTeam = winner === "challenger" ? challengers : defenders;
            const lTeam = winner === "challenger" ? defenders : challengers;
            prev.innerHTML = `<strong>DOUBLES</strong> — ${esc(wTeam.map(name).join(" & "))} beat ${esc(lTeam.map(name).join(" & "))} · No singles ladder movement.`;
          } else {
            const move = movementFor(challenger, defender, winner);
            prev.innerHTML = `<strong>${esc(move.movement.toUpperCase())}</strong> — ${esc(move.text)}`;
          }
        }
      } else {
        notesRow.style.display = "none";
        saveRow.style.display = "none";
      }
    } else {
      step3.style.display = "none";
    }
  }

  function updateMatchPreview() { renderMatchForm(); }

  function renderDoubles() {
    const el = $("#doublesLeaderboard");
    if (!el) return;
    const pairStats = statsByPair();
    const min = state.settings.doublesMinGames || 3;

    if (pairStats.size === 0) {
      el.innerHTML = `<div class="empty">No doubles matches logged yet. Use the Match tab and switch to Doubles mode.</div>`;
      return;
    }

    // Split into qualified (≥ min games) and pending
    const qualified = [], pending = [];
    for (const [key, s] of pairStats.entries()) {
      const winRate = s.played > 0 ? s.wins / s.played : 0;
      if (s.played >= min) qualified.push({ key, ...s, winRate });
      else pending.push({ key, ...s, winRate });
    }

    // Sort qualified: win rate desc, then total played desc, then most recent win desc
    qualified.sort((a, b) => b.winRate - a.winRate || b.played - a.played || new Date(b.lastPlayed) - new Date(a.lastPlayed));

    const AVATAR_COLORS = ["ba-pink","ba-blue","ba-purple","ba-green","ba-gray"];
    const avCls = (id) => AVATAR_COLORS[state.ladder.indexOf(id)] || "ba-gray";
    const pipHtml = (s) => {
      // show last 5 results for this pair (most recent first)
      const matches = [...state.matches]
        .filter(m => m.type === "doubles" && m.challengerIds && m.defenderIds)
        .filter(m => {
          const key = pairKey(s.ids[0], s.ids[1]);
          return pairKey(m.challengerIds[0], m.challengerIds[1]) === key ||
                 pairKey(m.defenderIds[0], m.defenderIds[1]) === key;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5)
        .reverse();
      return matches.map(m => {
        const wasChallenger = pairKey(m.challengerIds[0], m.challengerIds[1]) === pairKey(s.ids[0], s.ids[1]);
        const won = (wasChallenger && m.winnerTeam === "challenger") || (!wasChallenger && m.winnerTeam === "defender");
        return `<div class="pip ${won ? "w" : "l"}"></div>`;
      }).join("");
    };

    const rankClass = (i) => ["rank-1","rank-2","rank-3","rank-n"][i] || "rank-n";

    const qualHtml = qualified.length ? `
      <div class="doubles-col-head">
        <span>#</span><span>Pair</span>
        <span class="center">W</span><span class="center">L</span>
        <span class="right">Win rate</span>
      </div>
      ${qualified.map((s, i) => {
        const pct = Math.round(s.winRate * 100);
        const pctCls = pct >= 60 ? "pct-high" : pct >= 40 ? "pct-mid" : "pct-low";
        return `<div class="doubles-pair-row">
          <div class="rank ${rankClass(i)}">${i + 1}</div>
          <div class="doubles-pair-info">
            <div class="doubles-avatars">
              <div class="battle-avatar ${avCls(s.ids[0])}">${esc(name(s.ids[0]).slice(0,2).toUpperCase())}</div>
              <div class="battle-avatar ${avCls(s.ids[1])}">${esc(name(s.ids[1]).slice(0,2).toUpperCase())}</div>
            </div>
            <div>
              <div class="name">${esc(name(s.ids[0]))} &amp; ${esc(name(s.ids[1]))}</div>
              <div class="streak-pips">${pipHtml(s)}</div>
            </div>
          </div>
          <div class="stat-w">${s.wins}</div>
          <div class="stat-l">${s.losses}</div>
          <div class="streak-cell"><span class="doubles-pct ${pctCls}">${pct}%</span><div class="meta">${s.played} games</div></div>
        </div>`;
      }).join("")}` : "";

    const pendHtml = pending.length ? `
      <div class="doubles-pending-head">
        <span class="eyebrow" style="margin:14px 0 6px;display:block">Pending — need ${min} games to rank</span>
      </div>
      <div class="doubles-pending-list">
        ${pending.map(s => {
          const pct = Math.round(s.winRate * 100);
          return `<div class="doubles-pending-row">
            <div class="doubles-avatars">
              <div class="battle-avatar ${avCls(s.ids[0])}">${esc(name(s.ids[0]).slice(0,2).toUpperCase())}</div>
              <div class="battle-avatar ${avCls(s.ids[1])}">${esc(name(s.ids[1]).slice(0,2).toUpperCase())}</div>
            </div>
            <div>
              <span class="name">${esc(name(s.ids[0]))} &amp; ${esc(name(s.ids[1]))}</span>
              <span class="meta" style="margin-left:8px">${s.played}/${min} games · ${pct}% so far</span>
            </div>
          </div>`;
        }).join("")}
      </div>` : "";

    el.innerHTML = (qualHtml || `<div class="empty" style="margin-bottom:12px">No pairs have played ${min}+ games together yet.</div>`) + pendHtml;
  }

  function renderHistory() {
    const html = [...state.matches].sort((a,b) => new Date(b.date) - new Date(a.date)).map(m => {
      if (m.type === "doubles") {
        const cNames = (m.challengerIds || []).map(name).join(" & ");
        const dNames = (m.defenderIds || []).map(name).join(" & ");
        const winNames = m.winnerTeam === "challenger" ? cNames : dNames;
        return `<div class="history-card">
          <div><strong>${esc(cNames)} vs ${esc(dNames)}</strong><div class="meta">${fmtDate(m.date)} · ${esc(winNames)} won ${esc(m.score)}${m.notes ? ` · ${esc(m.notes)}` : ""}</div><span class="tag">doubles</span></div>
          <button class="btn small danger" data-delete-match="${esc(m.id)}">Delete</button>
        </div>`;
      }
      return `<div class="history-card">
        <div><strong>${esc(name(m.challengerId))} vs ${esc(name(m.defenderId))}</strong><div class="meta">${fmtDate(m.date)} · ${esc(name(m.winnerId))} won ${esc(m.score)}${m.notes ? ` · ${esc(m.notes)}` : ""}</div><span class="tag">${esc(m.direction)}</span><span class="tag">${esc(m.movement)}</span></div>
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
    const pairStats = statsByPair();

    // Singles awards
    const singlesAwards = [
      ["Ladder Champion", state.ladder[0] ? name(state.ladder[0]) : "-", "Rank #1 right now"],
      ["Most Wins", topBy(stats, "wins") ? `${name(topBy(stats, "wins")[0])} (${topBy(stats, "wins")[1].wins})` : "-", "Most singles wins"],
      ["Best Streak", [...stats.entries()].sort((a,b) => b[1].streak - a[1].streak)[0] ? `${name([...stats.entries()].sort((a,b) => b[1].streak - a[1].streak)[0][0])} (${[...stats.entries()].sort((a,b) => b[1].streak - a[1].streak)[0][1].streak || 0})` : "-", "Current streak"],
      ["Giant Killer", topBy(stats, "giantKills") ? `${name(topBy(stats, "giantKills")[0])} (${topBy(stats, "giantKills")[1].giantKills})` : "-", "Wins from two ranks below"],
      ["Bully", topBy(stats, "pushDownWins") ? `${name(topBy(stats, "pushDownWins")[0])} (${topBy(stats, "pushDownWins")[1].pushDownWins})` : "-", "Successful push-down wins"],
      ["Grinder", topBy(stats, "played") ? `${name(topBy(stats, "played")[0])} (${topBy(stats, "played")[1].played})` : "-", "Most singles matches played"]
    ];

    // Doubles awards
    const qualified = [...pairStats.values()].filter(s => s.played >= (state.settings.doublesMinGames || 3));
    let dynamicDuo = "-", undefeated = "-", versatile = "-";
    if (qualified.length) {
      const best = qualified.sort((a,b) => (b.wins/b.played) - (a.wins/a.played) || b.played - a.played)[0];
      dynamicDuo = `${name(best.ids[0])} & ${name(best.ids[1])} (${Math.round(best.wins/best.played*100)}%)`;
      const undf = qualified.find(s => s.losses === 0);
      if (undf) undefeated = `${name(undf.ids[0])} & ${name(undf.ids[1])} (${undf.played}-0)`;
    }
    // Most versatile: player who appears in the most distinct qualified pairs
    if (pairStats.size > 0) {
      const partnerCount = new Map();
      for (const s of pairStats.values()) {
        for (const id of s.ids) partnerCount.set(id, (partnerCount.get(id) || 0) + 1);
      }
      const top = [...partnerCount.entries()].sort((a,b) => b[1]-a[1])[0];
      if (top) versatile = `${name(top[0])} (${top[1]} partners)`;
    }
    const doublesAwards = [
      ["Dynamic Duo", dynamicDuo, "Best win rate (min. " + (state.settings.doublesMinGames||3) + " games)"],
      ["Undefeated Partners", undefeated, "Perfect record together"],
      ["Most Versatile", versatile, "Played with most different partners"]
    ];

    const singlesHtml = `<div class="awards-section-label eyebrow" style="grid-column:1/-1;margin:4px 0 2px">Singles</div>` +
      singlesAwards.map(a => `<div class="award-card"><strong>${esc(a[1])}</strong><div class="name">${esc(a[0])}</div><div class="meta">${esc(a[2])}</div></div>`).join("");
    const doublesHtml = `<div class="awards-section-label eyebrow" style="grid-column:1/-1;margin:12px 0 2px">Doubles</div>` +
      doublesAwards.map(a => `<div class="award-card"><strong>${esc(a[1])}</strong><div class="name">${esc(a[0])}</div><div class="meta">${esc(a[2])}</div></div>`).join("");

    $("#awards").innerHTML = singlesHtml + doublesHtml;
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
      ["Doubles mode", `Any two players can form a pair and play any other pair. Results never affect the singles ladder. Pairs appear on the Doubles leaderboard after ${s.doublesMinGames || 3} games together, ranked by win rate.`],
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
    const status = $("#syncStatus");
    if (status) {
      if (hasToken()) {
        status.textContent = "Token saved in this browser. Sync is automatic.";
      } else {
        status.textContent = "No token set — paste one above and click Save token.";
      }
    }
  }

  function prefillMatch(challengerId, defenderId) {
    matchWiz = { mode: "singles", challenger: challengerId || null, defender: defenderId || null, challengers: [], defenders: [], winner: null, score: null };
    switchTab("match");
  }

  function switchTab(tab) {
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${tab}`));
    if (tab === "match") renderMatchForm();
  }

  function saveMatch() {
    const isDoubles = matchWiz.mode === "doubles";

    if (isDoubles) {
      const { challengers, defenders, winner, score } = matchWiz;
      if (challengers.length !== 2 || defenders.length !== 2) return toast("Select 2 players per team.", "bad");
      if (!winner) return toast("Pick the winning team.", "bad");
      if (!score) return toast("Pick a score.", "bad");
      const notes = ($("#matchNotes") || {}).value?.trim() || "";
      const match = {
        id: uid("m"),
        type: "doubles",
        date: new Date().toISOString(),
        challengerIds: challengers,
        defenderIds: defenders,
        winnerTeam: winner,
        score,
        notes
      };
      state.matches.push(match);
      saveState();
      $("#matchNotes").value = "";
      toast("Doubles match saved.", "ok");
      matchWiz = { mode: "doubles", challenger: null, defender: null, challengers: [], defenders: [], winner: null, score: null };
      render();
      switchTab("doubles");
      autoSync();
      return;
    }

    // Singles path (original)
    const c = matchWiz.challenger || $("#challengerSelect").value;
    const d = matchWiz.defender || $("#defenderSelect").value;
    const w = matchWiz.winner || $("#winnerSelect").value;
    const score = matchWiz.score || $("#scoreSelect").value;
    const notes = ($("#matchNotes") || {}).value?.trim() || "";
    const move = movementFor(c, d, w);
    if (!move.allowed) return toast(`Cannot save: ${move.reason}`, "bad");
    const prevLadder = [...state.ladder];
    const match = { id: uid("m"), type: "singles", date: new Date().toISOString(), challengerId: c, defenderId: d, winnerId: w, score, notes, allowed: move.allowed, direction: move.direction, challengeDistance: move.challengeDistance, movement: move.movement };
    state.matches.push(match);
    applyMovement(c, d, move.movement);
    saveState();
    $("#matchNotes").value = "";
    toast("Match saved and ladder updated.", "ok");
    matchWiz = { mode: "singles", challenger: null, defender: null, challengers: [], defenders: [], winner: null, score: null };
    render();
    switchTab("dashboard");
    requestAnimationFrame(() => {
      state.ladder.forEach((id, newIdx) => {
        const oldIdx = prevLadder.indexOf(id);
        if (oldIdx === newIdx) return;
        const el = document.querySelector(`[data-player-id="${id}"]`);
        if (!el) return;
        el.classList.add(newIdx < oldIdx ? "rank-flash-up" : "rank-flash-down");
        setTimeout(() => el.classList.remove("rank-flash-up", "rank-flash-down"), 700);
      });
    });
    autoSync();
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
    saveState(); render(); toast(`${nm} added at the bottom.`, "ok"); autoSync();
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
    saveState(); render(); toast("Roster replaced and season reset.", "ok"); autoSync();
  }

  function startNewSeason() {
    if (!confirm("Start a new season? This clears match history but keeps the current ladder order.")) return;
    state.matches = [];
    state.season = { name: `Season ${new Date().toLocaleDateString()}`, startedAt: new Date().toISOString() };
    saveState(); render(); toast("New season started.", "ok"); autoSync();
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
    saveState(); render(); toast(`Applied ${moves.length} inactivity movement(s).`, "ok"); autoSync();
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
    const { owner, repo, branch, path } = GITHUB_SYNC_TARGET;
    const token = syncSettings.token;
    if (!owner || !repo || !path || !token) throw new Error("No sync token set. Paste your GitHub token in Settings → GitHub sync.");
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

  // Silently push to GitHub in the background after any state change.
  async function autoSync() {
    if (!hasToken()) return; // no token yet — skip silently
    try {
      let sha = undefined;
      try { sha = (await githubRequest("GET")).sha; } catch {}
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2))));
      const body = { message: `Auto-sync ladder ${new Date().toISOString()}`, content, branch: GITHUB_SYNC_TARGET.branch || "main", ...(sha ? { sha } : {}) };
      await githubRequest("PUT", body);
      toast("Synced to GitHub \u2713", "ok");
    } catch (err) {
      toast(`GitHub sync failed: ${err.message}`, "bad");
    }
  }

  // Pull latest state from GitHub on page load, then render.
  async function initWithAutoPull() {
    if (!hasToken()) {
      render();
      showTokenModal();
      return;
    }
    try {
      const data = await githubRequest("GET");
      const decoded = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))));
      const remote = normalize(decoded);
      const localTime = state.updatedAt ? new Date(state.updatedAt).getTime() : 0;
      const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
      if (remoteTime > localTime) {
        state = remote;
        saveState();
        toast("Loaded latest state from GitHub.", "ok");
      }
    } catch {
      // Silently fall back to local state if GitHub is unreachable.
    }
    render();
  }

  // ── First-time token modal ──
  function showTokenModal() {
    if ($("#tokenModal")) return;
    const modal = document.createElement("div");
    modal.id = "tokenModal";
    modal.className = "token-modal-overlay";
    modal.innerHTML = `
      <div class="token-modal">
        <div class="token-modal-icon">🔑</div>
        <h2 class="token-modal-title">One-time setup</h2>
        <p class="token-modal-body">This app syncs the ladder automatically via GitHub. Paste the shared sync token once — it stays in your browser forever.</p>
        <label class="token-modal-label">
          GitHub sync token
          <input id="tokenModalInput" type="password" placeholder="github_pat_…" autocomplete="off" />
        </label>
        <div class="token-modal-hint">Ask your ladder admin for the token. It's only stored in your browser — never sent anywhere except GitHub.</div>
        <button class="btn primary token-modal-btn" data-action="save-sync-settings-modal">Save &amp; connect</button>
        <button class="btn token-modal-skip" data-action="skip-token-modal">Skip for now (read-only)</button>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add("visible"), 10);
    const inp = $("#tokenModalInput");
    if (inp) inp.focus();
  }

  function hideTokenModal() {
    const modal = $("#tokenModal");
    if (!modal) return;
    modal.classList.remove("visible");
    setTimeout(() => modal.remove(), 220);
  }

  document.addEventListener("click", e => {
    if (e.target.closest("[data-action='save-sync-settings-modal']")) {
      const inp = $("#tokenModalInput");
      const t = inp ? inp.value.trim() : "";
      if (!t) { inp && inp.focus(); return; }
      syncSettings = { ...GITHUB_SYNC_TARGET, token: t };
      saveSyncSettings();
      // also update the settings tab input if visible
      const settingsInput = $("#syncToken");
      if (settingsInput) settingsInput.value = t;
      toast("Token saved — syncing now…", "ok");
      hideTokenModal();
      renderSyncForm();
      initWithAutoPull();
    }
    if (e.target.closest("[data-action='skip-token-modal']")) {
      hideTokenModal();
      toast("Skipped. You can set a token in Settings anytime.", "warn");
    }
  }, true); // capture phase so it fires before the main listener

  document.addEventListener("click", e => {
    const tab = e.target.closest("[data-tab]"); if (tab) return switchTab(tab.dataset.tab);
    const open = e.target.closest("[data-open-panel]"); if (open) return switchTab(open.dataset.openPanel);
    const action = e.target.closest("[data-action]")?.dataset.action;
    // Mode toggle in match wizard
    const modeBtn = e.target.closest("[data-mode]");
    if (modeBtn && modeBtn.closest("#matchModeToggle")) { matchWizSetMode(modeBtn.dataset.mode); return; }
    if (action === "save-match") saveMatch();
    if (action === "reset-match-form") { matchWizReset(); }
    if (action === "add-player") addPlayer();
    if (action === "replace-roster") replaceRoster();
    if (action === "new-season") startNewSeason();
    if (action === "apply-inactivity") applyInactivity();
    if (action === "export-state") exportState();
    if (action === "factory-reset" && confirm("Reset this browser to the default demo state?")) { state = normalize(DEFAULT_STATE); saveState(); render(); toast("Factory reset complete.", "ok"); }
    if (action === "clear-matches" && confirm("Clear all match history?")) { state.matches = []; saveState(); render(); toast("Match history cleared.", "ok"); autoSync(); }
    if (action === "open-sync") switchTab("settings");
    if (action === "save-sync-settings") {
      const t = $("#syncToken").value.trim();
      if (!t) return toast("Paste a token first.", "bad");
      syncSettings = { ...GITHUB_SYNC_TARGET, token: t };
      saveSyncSettings();
      toast("Token saved — syncing now…", "ok");
      hideTokenModal();
      initWithAutoPull();
      return;
    }
    if (action === "pull-github") pullGithub();
    if (action === "push-github") pushGithub();
    const del = e.target.closest("[data-delete-match]")?.dataset.deleteMatch;
    if (del && confirm("Delete this match? Ladder order will not be replayed automatically; use only for recent mistakes.")) { state.matches = state.matches.filter(m => m.id !== del); saveState(); render(); autoSync(); }
    const up = e.target.closest("[data-move-up]")?.dataset.moveUp;
    if (up) { const i = state.ladder.indexOf(up); if (i > 0) [state.ladder[i-1], state.ladder[i]] = [state.ladder[i], state.ladder[i-1]]; saveState(); render(); autoSync(); }
    const down = e.target.closest("[data-move-down]")?.dataset.moveDown;
    if (down) { const i = state.ladder.indexOf(down); if (i >= 0 && i < state.ladder.length - 1) [state.ladder[i+1], state.ladder[i]] = [state.ladder[i], state.ladder[i+1]]; saveState(); render(); autoSync(); }
    // Wizard: challenger pick
    const wizC = e.target.closest("[data-wiz-challenger]");
    if (wizC) { matchWizSetChallenger(wizC.dataset.wizChallenger); return; }
    // Wizard: defender pick
    const wizD = e.target.closest("[data-wiz-defender]");
    if (wizD && !wizD.classList.contains("disabled-pick")) { matchWizSetDefender(wizD.dataset.wizDefender); return; }
    // Wizard: winner pick (arena card click)
    const wizW = e.target.closest("[data-wiz-winner]");
    if (wizW) { matchWizSetWinner(wizW.dataset.wizWinner); return; }
    // Wizard: score pick
    const wizS = e.target.closest("[data-wiz-score]");
    if (wizS) { matchWizSetScore(wizS.dataset.wizScore); return; }
    // Quick-challenge from leaderboard row hover button
    const qc = e.target.closest("[data-quick-challenge]")?.dataset.quickChallenge;
    if (qc) { e.stopPropagation(); prefillMatch(qc, null); return; }
    // Battle card "Set this up" CTA
    const bc = e.target.closest("[data-battle-c]");
    if (bc && e.target.closest(".battle-cta")) { prefillMatch(bc.dataset.battleC, bc.dataset.battleD); return; }
    // Clicking anywhere on a battle card also prefills
    const battleCard = e.target.closest(".battle-card");
    if (battleCard && !e.target.closest(".battle-cta")) { prefillMatch(battleCard.dataset.battleC, battleCard.dataset.battleD); return; }
  });

  document.addEventListener("input", e => {
    // challenger/defender/winner selects are now hidden; wizard handles interaction
    const rename = e.target.dataset.rename;
    if (rename) { const p = player(rename); if (p) { p.name = e.target.value.trim() || p.name; saveState(); renderMetrics(); renderLeaderboard(); renderBattles(); renderAwards(); } }
  });
  $("#importFile").addEventListener("change", e => importState(e.target.files[0]));

  saveState();
  initWithAutoPull();
})();
