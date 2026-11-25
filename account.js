// darkvisuals account page: sign in/up, subscription, YooKassa payment, admin panel.
(async () => {
  const $ = (id) => document.getElementById(id);
  const views = ['loading', 'offline', 'auth', 'dash'];
  const show = (v) => views.forEach((n) => { $('view-' + n).hidden = n !== v; });
  const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const daysLeft = (d) => Math.max(0, Math.ceil((Date.parse(d) - Date.now()) / 86400000));
  const rub = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------ config
  let cfg = null;
  try {
    const r = await fetch('config.json', { cache: 'no-store' });
    if (r.ok) cfg = await r.json();
  } catch { /* offline */ }
  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) {
    show('offline');
    return;
  }
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'darkvisuals-auth' },
  });

  // ------------------------------------------------------------------ auth form
  let mode = 'in';
  const form = $('auth-form');
  document.querySelectorAll('.seg [data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('.seg [data-mode]').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
    $('f-name').hidden = mode !== 'up';
    $('auth-submit').textContent = mode === 'up' ? 'Создать аккаунт' : 'Войти';
    form.password.autocomplete = mode === 'up' ? 'new-password' : 'current-password';
    $('auth-error').textContent = '';
  }));

  const authError = (e) => {
    const m = String(e?.message || e || '');
    if (/invalid login/i.test(m)) return 'Неверная почта или пароль';
    if (/already registered|already been registered/i.test(m)) return 'Эта почта уже зарегистрирована';
    if (/username_taken/i.test(m) || /database error saving new user/i.test(m)) return 'Этот ник занят';
    if (/bad_username/i.test(m)) return 'Ник: 3–16 символов, только латиница, цифры и _';
    if (/password/i.test(m)) return 'Пароль слишком простой: нужно не меньше 6 символов';
    if (/rate limit/i.test(m)) return 'Слишком много попыток, подожди минуту';
    if (/email/i.test(m)) return 'Проверь почту';
    return 'Не получилось: ' + m;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    const username = form.username.value.trim();
    const err = $('auth-error');
    err.textContent = '';
    if (!email || !password) { err.textContent = 'Заполни почту и пароль'; return; }
    const btn = $('auth-submit');
    btn.disabled = true;
    try {
      if (mode === 'up') {
        if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('bad_username');
        const { data: free } = await sb.rpc('username_available', { name: username });
        // The reserved admin nick shows as taken here; the server still lets its owner register it.
        if (free === false && username.toLowerCase() !== 'legdaygd0011') throw new Error('username_taken');
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
        if (error) throw error;
        if (!data.session) {
          const r = await sb.auth.signInWithPassword({ email, password });
          if (r.error) throw r.error;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await render();
    } catch (ex) {
      err.textContent = authError(ex);
    } finally {
      btn.disabled = false;
    }
  });

  $('signout').addEventListener('click', async () => {
    await sb.auth.signOut();
    $('signout').hidden = true;
    show('auth');
  });

  // ------------------------------------------------------------------ dashboard
  async function status() {
    const { data, error } = await sb.functions.invoke('license', { body: {} });
    if (error) throw error;
    return data;
  }

  async function render(checkPayment = false) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { show('auth'); return; }
    $('signout').hidden = false;
    show('dash');
    const { data: prof } = await sb.from('profiles').select('username, is_admin, sub_until').eq('id', session.user.id).maybeSingle();
    const name = prof?.username || session.user.user_metadata?.username || 'игрок';
    $('d-name').textContent = name;
    $('d-avatar').textContent = name[0].toUpperCase();
    $('d-email').textContent = session.user.email || '';
    $('d-admin').hidden = !prof?.is_admin;

    let st = { active: false, until: prof?.sub_until, admin: prof?.is_admin };
    try {
      st = await status();
    } catch { /* functions not reachable: fall back to the profile */ }
    if (checkPayment && !st.active) {
      $('sub-detail').textContent = 'Проверяем оплату…';
      for (let i = 0; i < 10 && !st.active; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try { st = await status(); } catch { /* retry */ }
      }
    }
    paintSub(st);
    loadHistory(session.user.id);
    if (prof?.is_admin) loadAdmin();
  }

  function paintSub(st) {
    const pill = $('sub-pill');
    const active = st.admin || (st.until && Date.parse(st.until) > Date.now());
    pill.classList.toggle('on', !!active);
    if (st.admin) {
      pill.textContent = 'Безлимит';
      $('sub-detail').textContent = 'Админу подписка не нужна';
    } else if (active) {
      pill.textContent = 'Активна';
      $('sub-detail').textContent = `до ${fmtDate(st.until)} · осталось ${daysLeft(st.until)} дн.`;
    } else {
      pill.textContent = 'Нет подписки';
      $('sub-detail').textContent = st.until ? `закончилась ${fmtDate(st.until)}` : '';
    }
    $('pay').textContent = active && !st.admin ? 'Продлить на 30 дней · 50 ₽' : 'Оплатить картой или СБП';
  }

  async function loadHistory(uid) {
    const { data } = await sb.from('payments').select('amount, status, created_at, paid_at, days').eq('user_id', uid)
      .order('created_at', { ascending: false }).limit(10);
    const paid = (data || []).filter((p) => p.status === 'succeeded');
    $('history').hidden = paid.length === 0;
    $('history-list').innerHTML = paid.map((p) =>
      `<li><span>${fmtDate(p.paid_at || p.created_at)} · ${p.days} дн.</span><span>${rub(p.amount)}</span></li>`).join('');
  }

  $('pay').addEventListener('click', async () => {
    const btn = $('pay');
    $('pay-error').textContent = '';
    btn.disabled = true;
    try {
      const { data, error } = await sb.functions.invoke('create-payment', { body: { returnUrl: location.href.split('?')[0] + '?paid=1' } });
      if (error || !data?.url) throw error || new Error('нет ссылки на оплату');
      location.href = data.url;
    } catch (e) {
      $('pay-error').textContent = 'Оплата сейчас недоступна, попробуй позже';
      console.error(e);
      btn.disabled = false;
    }
  });

  // ------------------------------------------------------------------ admin
  let searchTimer = 0;
  $('q').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadUsers, 250);
  });

  async function loadAdmin() {
    $('admin').hidden = false;
    const { data: s } = await sb.rpc('admin_stats');
    if (s) {
      $('s-users').textContent = s.users;
      $('s-active').textContent = s.active;
      $('s-payments').textContent = s.payments;
      $('s-revenue').textContent = rub(s.revenue);
    }
    loadUsers();
  }

  async function loadUsers() {
    const { data, error } = await sb.rpc('admin_list_users', { q: $('q').value.trim(), lim: 100 });
    if (error) { $('admin-msg').textContent = 'Не удалось загрузить: ' + error.message; return; }
    $('users').innerHTML = (data || []).map((u) => {
      const active = u.is_admin || (u.sub_until && Date.parse(u.sub_until) > Date.now());
      const sub = u.is_admin ? '<span class="status-on">безлимит</span>'
        : active ? `<span class="status-on">до ${fmtDate(u.sub_until)}</span>` : '<span class="status-off">нет</span>';
      return `<tr data-id="${esc(u.id)}" data-name="${esc(u.username)}">
        <td>${esc(u.username)} ${u.is_admin ? '<span class="badge-admin">admin</span>' : ''}</td>
        <td>${esc(u.email)}</td>
        <td>${sub}</td>
        <td>${rub(u.paid_total)}</td>
        <td class="right"><div class="actions">
          <button class="mini" data-days="30">+30 дн.</button>
          <button class="mini" data-days="7">+7</button>
          <input class="mini-input" type="number" min="1" max="3650" placeholder="дн." aria-label="Своё число дней">
          <button class="mini" data-days="custom">Выдать</button>
          ${active && !u.is_admin ? '<button class="mini danger" data-revoke="1">Забрать</button>' : ''}
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="status-off">Никого не нашли</td></tr>';
  }

  $('users').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const tr = b.closest('tr');
    const id = tr.dataset.id, name = tr.dataset.name;
    const msg = $('admin-msg');
    try {
      if (b.dataset.revoke) {
        if (!confirm(`Забрать подписку у ${name}?`)) return;
        const { error } = await sb.rpc('admin_revoke', { target: id });
        if (error) throw error;
        msg.textContent = `Подписка ${name} снята`;
      } else {
        const days = b.dataset.days === 'custom' ? parseInt(tr.querySelector('.mini-input').value, 10) : parseInt(b.dataset.days, 10);
        if (!(days >= 1 && days <= 3650)) { msg.textContent = 'Укажи от 1 до 3650 дней'; return; }
        const { data, error } = await sb.rpc('admin_grant', { target: id, days });
        if (error) throw error;
        msg.textContent = `${name}: +${days} дн., подписка до ${fmtDate(data)}`;
      }
      loadAdmin();
    } catch (ex) {
      msg.textContent = 'Ошибка: ' + ex.message;
    }
  });

  // ------------------------------------------------------------------ start
  const paid = new URLSearchParams(location.search).has('paid');
  if (paid) history.replaceState(null, '', location.pathname);
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') show('auth'); });
  await render(paid);
})();
