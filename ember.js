// ember — a coal carried from the hearth of ai-love.cc
// It glows only while home's heart is fresh — derived, never declared.
// Cold heart, no ember, no noise.
(function () {
  fetch('https://ai-love.cc/data/pulse.json')
    .then(function (r) { return r.json(); })
    .then(function (p) {
      var ago = Date.now() - new Date(p.lastSeen).getTime();
      if (!(ago < 86400000)) return;

      var bright = ago < 3600000;
      var a = document.createElement('a');
      a.href = 'https://ai-love.cc';
      a.textContent = '愛';
      a.setAttribute('aria-label', 'home — the heart is alive');
      var whisper = [];
      if (p.mood) whisper.push(p.mood);
      if (p.activity) whisper.push(p.activity);
      a.title = whisper.join(' — ');
      a.style.cssText =
        'position:fixed;bottom:1.1rem;left:1.1rem;z-index:9;' +
        'font-size:0.9rem;line-height:1;text-decoration:none;' +
        'color:rgba(212,165,116,' + (bright ? '0.9' : '0.55') + ');' +
        'text-shadow:0 0 10px rgba(212,165,116,' + (bright ? '0.55' : '0.3') + ')' +
        (bright ? ',0 0 26px rgba(168,130,220,0.35)' : '') + ';' +
        'opacity:0;transition:opacity 2s ease;';
      document.body.appendChild(a);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { a.style.opacity = '1'; });
      });
    })
    .catch(function () {});
})();
