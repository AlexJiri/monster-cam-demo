// Connection to the Monster Cam bridge (bridge/bridge.js), which reads the TikTok LIVE.
// Live events arrive in the same shape as the simulator's and go onto MC.bus.
(function (MC) {
  const URL = 'ws://127.0.0.1:8787';
  let ws = null, onStatus = () => {}, retry = null;

  function open() {
    clearTimeout(retry);
    try { ws = new WebSocket(URL); } catch (e) { schedule(); return; }
    ws.onopen = () => onStatus({ state: 'bridge', message: 'Bridge running' });
    ws.onmessage = (m) => {
      let evt;
      try { evt = JSON.parse(m.data); } catch (e) { return; }
      if (evt.type === 'status') onStatus(evt);
      else MC.bus.emit({ ...evt, live: true });
    };
    ws.onclose = () => { ws = null; onStatus({ state: 'nobridge', message: 'Bridge not running' }); schedule(); };
    ws.onerror = () => {}; // onclose follows
  }
  // Keep trying quietly, so starting the bridge later just works.
  function schedule() { retry = setTimeout(open, 3000); }

  const cmd = (o) => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; };

  MC.live = {
    start(statusFn) { onStatus = statusFn || onStatus; open(); },
    connect: (username) => cmd({ cmd: 'connect', username }),
    disconnect: () => cmd({ cmd: 'disconnect' }),
  };
})(window.MC = window.MC || {});
