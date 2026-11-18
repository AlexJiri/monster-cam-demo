// Duel connection: host or join a duel on the Monster Cam server, then pass moves to the opponent's game.
// One duel at a time. Events from the opponent arrive through on(type, fn): hello, joined, ready, unready, start,
// attack, lives, end, left, plus 'link' (true/false: the connection to the server came back / dropped).
(function (MC) {
  const KEY = 'monstercam-duel'; // the duel under way, so a page reload can reconnect to it
  let duel = null; // { code, token, host }
  let es = null;
  const handlers = {};
  const fire = (type, data) => (handlers[type] || []).concat(handlers['*'] || []).forEach((fn) => fn(data, type));
  const api = () => MC.edition.server();

  async function post(path, body) {
    let r;
    try { r = await fetch(api() + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }); }
    catch (e) { throw new Error('Could not reach the Monster Cam server. Check the internet.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Server error ${r.status}`);
    return j;
  }
  function listen() {
    if (es) es.close();
    es = new EventSource(`${api()}/v1/duel/events?code=${encodeURIComponent(duel.code)}&token=${encodeURIComponent(duel.token)}`);
    es.onopen = () => fire('link', true);
    es.onerror = () => {
      fire('link', false);
      // The duel is gone from the server (restart, or left long ago): stop trying.
      if (es && es.readyState === EventSource.CLOSED) { fire('left', { name: '', why: 'gone' }); clear(); }
    };
    for (const t of ['hello', 'joined', 'ready', 'unready', 'start', 'attack', 'lives', 'end', 'left']) {
      es.addEventListener(t, (e) => { let d = {}; try { d = JSON.parse(e.data); } catch (err) {} fire(t, d); });
    }
  }
  function remember() { try { duel ? sessionStorage.setItem(KEY, JSON.stringify(duel)) : sessionStorage.removeItem(KEY); } catch (e) {} }
  function clear() { if (es) es.close(); es = null; duel = null; remember(); }

  MC.duel = {
    get active() { return !!duel; },
    get code() { return duel && duel.code; },
    get isHost() { return !!(duel && duel.host); },
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    async host(name) {
      const r = await post('/v1/duel/host', { game: MC.edition.GAME, name });
      duel = { code: r.code, token: r.token, host: true }; remember(); listen();
      return r.code;
    },
    async join(code, name) {
      const r = await post('/v1/duel/join', { game: MC.edition.GAME, code, name });
      duel = { code: String(code).toUpperCase().trim(), token: r.token, host: false }; remember(); listen();
      return r.opponent;
    },
    // A move for the opponent. Resolves false when it didn't get through (no duel, offline).
    async send(type, data = {}) {
      if (!duel) return false;
      try { await post('/v1/duel/send', { code: duel.code, token: duel.token, type, data }); return true; } catch (e) { return false; }
    },
    async leave() {
      if (!duel) return;
      const d = duel; clear();
      try { await post('/v1/duel/send', { code: d.code, token: d.token, type: 'leave' }); } catch (e) {}
    },
    // After a reload in the middle of a duel: reconnect (the server keeps the seat for 30 s).
    resume() {
      try { duel = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { duel = null; }
      if (duel) listen();
      return !!duel;
    },
  };
})(window.MC = window.MC || {});
