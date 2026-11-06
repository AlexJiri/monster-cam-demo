// Live events (comments, likes, follows, gifts) in one shape, whether they come from the
// simulator or, later, from the TikTok connector:
//   { type: 'comment' | 'like' | 'follow' | 'gift', user, text?, gift?, count? }
(function (MC) {
  const handlers = {};
  MC.bus = {
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    emit(evt) {
      (handlers[evt.type] || []).concat(handlers['*'] || []).forEach((fn) => fn(evt));
    },
  };
})(window.MC = window.MC || {});
