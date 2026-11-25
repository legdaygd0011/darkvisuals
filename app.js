// darkvisuals site: before/after slider, scene tabs, launcher screens, reveal on scroll.
(() => {
  const NOTES = {
    fight: 'Кольцо вокруг цели, частицы удара, карточка цели с бронёй и дистанцией, свой хотбар и полосы здоровья.',
    hud: 'Свой HUD: водяной знак, список функций, клавиши, сессия, эффекты, броня и неоновая катана в руке.',
    sky: 'Custom Sky: северное сияние, яркие звёзды и свой цвет неба. Видишь только ты.',
    player: '3D-модель «Самурай» вместо скина, крылья и украшения из Cosmetics.',
    menu: 'Своё главное меню: быстрый вход на сервера, тёмная тема, никаких лишних кнопок.',
  };

  // ---------------------------------------------------------------- compare slider
  const box = document.getElementById('compare-box');
  const on = box.querySelector('.cmp-on');
  const off = box.querySelector('.cmp-off');
  const handle = box.querySelector('.cmp-handle');
  const note = document.getElementById('cmp-note');
  let pos = 50;

  const setPos = (p) => {
    pos = Math.max(0, Math.min(100, p));
    box.style.setProperty('--pos', pos + '%');
    handle.setAttribute('aria-valuenow', String(Math.round(pos)));
  };

  const fromEvent = (e) => {
    const r = box.getBoundingClientRect();
    setPos(((e.clientX - r.left) / r.width) * 100);
  };

  let dragging = false;
  box.addEventListener('pointerdown', (e) => {
    dragging = true;
    box.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  box.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
  const stop = () => { dragging = false; };
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setPos(pos - step);
    else if (e.key === 'ArrowRight') setPos(pos + step);
    else if (e.key === 'Home') setPos(0);
    else if (e.key === 'End') setPos(100);
    else return;
    e.preventDefault();
  });

  // Preload every scene so switching is instant
  Object.keys(NOTES).forEach((s) => {
    new Image().src = `img/${s}_on.webp`;
    new Image().src = `img/${s}_off.webp`;
  });

  const tabs = document.querySelectorAll('.tabs [data-scene]');
  tabs.forEach((t) => t.addEventListener('click', () => {
    const s = t.dataset.scene;
    tabs.forEach((o) => o.setAttribute('aria-selected', String(o === t)));
    on.src = `img/${s}_on.webp`;
    off.src = `img/${s}_off.webp`;
    note.textContent = NOTES[s];
    // A short sweep shows what changed
    const start = performance.now();
    const sweep = (now) => {
      const k = Math.min(1, (now - start) / 700);
      const ease = 1 - Math.pow(1 - k, 3);
      setPos(80 - 30 * ease);
      if (k < 1 && !dragging) requestAnimationFrame(sweep);
    };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(sweep);
  }));

  // ---------------------------------------------------------------- launcher screens
  const shot = document.getElementById('launcher-img');
  const pills = document.querySelectorAll('.pills [data-shot]');
  const SHOT_ALT = { play: 'вкладка «Играть»', visuals: 'вкладка «Визуалы»', controls: 'вкладка «Управление»' };
  pills.forEach((p) => p.addEventListener('click', () => {
    pills.forEach((o) => o.setAttribute('aria-selected', String(o === p)));
    shot.style.opacity = '0';
    setTimeout(() => {
      shot.src = `img/launcher_${p.dataset.shot}.webp`;
      shot.alt = `Лаунчер darkvisuals, ${SHOT_ALT[p.dataset.shot]}`;
      shot.onload = () => { shot.style.opacity = '1'; };
    }, 180);
  }));

  // ---------------------------------------------------------------- platform buttons
  document.querySelectorAll('[data-platform]').forEach((a) => a.addEventListener('click', () => {
    const card = document.getElementById(a.dataset.platform === 'pc' ? 'dl-pc' : 'dl-android');
    card.classList.remove('flash');
    setTimeout(() => card.classList.add('flash'), 400);
    setTimeout(() => card.classList.remove('flash'), 2200);
  }));

  // Suggest the right card for phones
  if (/Android/i.test(navigator.userAgent)) {
    const pcBtn = document.querySelector('.cta [data-platform="pc"]');
    const anBtn = document.querySelector('.cta [data-platform="android"]');
    pcBtn.classList.replace('btn-primary', 'btn-ghost');
    anBtn.classList.replace('btn-ghost', 'btn-primary');
    anBtn.parentNode.insertBefore(anBtn, pcBtn);
  }

  // ---------------------------------------------------------------- reveal on scroll
  const items = document.querySelectorAll('.section-head, .cat, .safe, .model, .window, .points li, .dl, .qa, .compare, .stats');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
  }
})();

// Buy links follow the lot set in the admin panel
(async () => {
  try {
    const cfg = await (await fetch('config.json', { cache: 'no-store' })).json();
    const res = await fetch(cfg.url + '/rest/v1/rpc/shop_info', {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const shop = await res.json();
    if (shop && shop.buy_url) document.querySelectorAll('.js-buy').forEach((a) => { a.href = shop.buy_url; });
  } catch { /* keep the built-in link */ }
})();
