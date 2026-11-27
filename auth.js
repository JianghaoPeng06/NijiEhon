/* Supabase owns identity, tokens, refresh and cross-tab session synchronization. */
(() => {
  const $ = selector => document.querySelector(selector);
  const config = window.NIJI_AUTH_CONFIG || {};
  const form = $('#login');
  const card = $('#account-card');
  const footerLogin = $('footer a[href="index.html#login"]');
  const dialog = $('#avatar-dialog');
  const defaultAvatar = 'assets/default-avatar.png';
  let client, user = null, ready = false, busy = false, sentEmail = '', resendAt = 0;
  let avatarObjectUrl, avatarRevision = 0, avatarSignature = '', returnFocus;
  let authRevision = 0;

  // Old demo data must never grant a real session.
  try {
    Object.keys(sessionStorage).filter(key => key.startsWith('nijiehon.demo')).forEach(key => sessionStorage.removeItem(key));
  } catch {}

  function status(message) {
    document.querySelectorAll('[data-auth-status]').forEach(node => { node.textContent = message; });
  }
  function errorMessage(error) {
    if (error?.status === 429 || /rate_limit/.test(error?.code || '')) return '操作过于频繁，请稍后再试。';
    if (error?.code === 'otp_expired') return '验证码无效或已过期，请检查或重新获取。';
    if (error?.code === 'signup_disabled') return '暂未开放新账号注册。';
    return '暂时无法完成操作，请检查网络后重试。';
  }
  function controls() {
    const disabled = !ready || !client || busy;
    document.querySelectorAll('[data-auth-control]').forEach(node => { node.disabled = disabled; });
    if ($('#resend-code')) {
      const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      $('#resend-code').disabled = disabled || seconds > 0;
      $('#resend-code').textContent = seconds ? `${seconds} 秒后重发` : '重新发送验证码';
    }
    if ($('#login-email')) $('#login-email').readOnly = !!sentEmail;
    if ($('#login-code')) $('#login-code').required = !!sentEmail;
    if ($('#email-code-step')) $('#email-code-step').hidden = !sentEmail;
    if ($('#email-submit')) $('#email-submit').textContent = sentEmail ? '验证并登录' : '获取邮箱验证码';
    form?.setAttribute('aria-busy', String(busy || !ready));
    if ($('#account-edit')) $('#account-edit').disabled = !ready;
  }
  function setAvatar(source) {
    document.querySelectorAll('[data-user-avatar]').forEach(image => {
      image.onerror = () => { image.onerror = null; image.src = defaultAvatar; };
      image.src = source;
    });
  }
  function clearAvatar() {
    avatarRevision++;
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = null;
    setAvatar(defaultAvatar);
  }
  async function loadAvatar(currentUser) {
    const revision = ++avatarRevision;
    const metadata = currentUser.user_metadata || {};
    if (!metadata.avatar_version) return;
    try {
      const { data, error } = await client.storage.from('avatars').download(`${currentUser.id}/avatar.png`);
      if (error) throw error;
      if (user?.id !== currentUser.id || revision !== avatarRevision) return;
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = URL.createObjectURL(data);
      setAvatar(avatarObjectUrl);
    } catch {
      // An unavailable avatar must not invalidate an otherwise valid login.
      if (revision === avatarRevision && $('#avatar-status')) $('#avatar-status').textContent = '头像暂时无法加载，请稍后刷新重试。';
    }
  }
  function render(nextUser) {
    const changedUser = user?.id !== nextUser?.id;
    user = nextUser || null;
    if (changedUser) { dialog?.close(); sentEmail = ''; form?.reset(); if ($('#avatar-status')) $('#avatar-status').textContent = ''; }
    const name = user ? (user.user_metadata?.full_name || user.email?.split('@')[0] || '我的账户') : '访客';
    const href = user ? 'account.html' : 'index.html#login';
    for (const link of [$('.login'), footerLogin]) {
      if (link) { link.textContent = user ? '个人中心' : '登录'; link.href = href; }
    }
    $('header .avatar')?.setAttribute('aria-label', user ? '个人中心' : '个人中心（未登录）');
    if (form) form.hidden = !!user;
    if (card) card.hidden = !user;
    document.querySelectorAll('[data-account-name]').forEach(node => { node.textContent = name; });
    if ($('#name')) $('#name').textContent = name;
    if ($('#email')) $('#email').textContent = user?.email || '';
    document.querySelectorAll('[data-sign-out]').forEach(node => { node.hidden = !user; });
    if ($('#account-login')) $('#account-login').hidden = !!user;
    if ($('.orders')) $('.orders').textContent = user ? '订单功能即将开放' : '登录后查看订单';
    if ($('#avatar-settings')) $('#avatar-settings').hidden = !user;
    if ($('#avatar-login')) $('#avatar-login').hidden = !!user;
    const signature = user ? `${user.id}:${user.user_metadata?.avatar_version || ''}` : '';
    if (signature !== avatarSignature || changedUser) {
      avatarSignature = signature;
      clearAvatar();
      // Keep SDK calls outside onAuthStateChange's synchronous callback.
      if (user) { const current = user; setTimeout(() => { if (user?.id === current.id) loadAvatar(current); }, 0); }
    }
    controls();
  }
  async function action(task) {
    if (!ready || !client || busy) return;
    busy = true; controls(); status('');
    try { await task(); } catch (error) { status(errorMessage(error)); }
    finally { busy = false; controls(); }
  }
  async function sendCode() {
    const email = $('#login-email').value.trim();
    if (Date.now() < resendAt) { status('请等待倒计时结束后再发送。'); return; }
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
    sentEmail = email; resendAt = Date.now() + 60000;
    controls(); status('验证码已发送，请查收邮箱（也可检查垃圾邮件）。');
    $('#login-code').focus();
  }
  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (!config.emailEnabled) return;
    action(async () => {
      if (!sentEmail) return sendCode();
      const { data, error } = await client.auth.verifyOtp({ email: sentEmail, token: $('#login-code').value.trim(), type: 'email' });
      if (error) throw error;
      render(data.user); status('登录成功。');
      $('#account-card a')?.focus();
    });
  });
  $('#resend-code')?.addEventListener('click', () => action(sendCode));
  $('#change-email')?.addEventListener('click', () => {
    if (busy) return;
    sentEmail = ''; $('#login-code').value = ''; controls(); status(''); $('#login-email').focus();
  });
  if (form) setInterval(controls, 1000);
  document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', () => action(async () => {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    render(null); status('已退出登录。');
    if (form) $('#login-email')?.focus(); else $('#account-login')?.focus();
  })));
  $('#account-back')?.addEventListener('click', () => {
    if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) history.back();
    else location.href = 'index.html';
  });
  function openAvatar() {
    if (!dialog || dialog.open) return;
    returnFocus = document.activeElement;
    dialog.showModal(); document.documentElement.classList.add('avatar-open');
    document.querySelectorAll('[aria-controls="avatar-dialog"]').forEach(node => node.setAttribute('aria-expanded', 'true'));
  }
  $('#avatar-preview')?.addEventListener('click', openAvatar);
  $('#account-edit')?.addEventListener('click', () => {
    if (!user) { location.href = 'index.html#login'; return; }
    openAvatar(); $('#avatar-file').focus();
  });
  $('#avatar-close')?.addEventListener('click', () => dialog.close());
  let backdropDown = false;
  const outside = event => { const box = dialog.getBoundingClientRect(); return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom; };
  dialog?.addEventListener('pointerdown', event => { backdropDown = event.target === dialog && outside(event); });
  dialog?.addEventListener('click', event => { if (backdropDown && event.target === dialog && outside(event)) dialog.close(); });
  dialog?.addEventListener('close', () => {
    document.documentElement.classList.remove('avatar-open');
    document.querySelectorAll('[aria-controls="avatar-dialog"]').forEach(node => node.setAttribute('aria-expanded', 'false'));
    returnFocus?.focus({ preventScroll: true });
  });
  $('#avatar-file')?.addEventListener('change', async event => {
    const file = event.target.files[0], currentUser = user;
    if (!file || !currentUser || !client) return;
    const message = $('#avatar-status');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      message.textContent = '请选择 5 MB 以内的 PNG、JPEG 或 WebP 图片。'; event.target.value = ''; return;
    }
    event.target.disabled = true; message.textContent = '正在保存头像…';
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || user?.id !== currentUser.id) return;
      const { error } = await client.storage.from('avatars').upload(`${currentUser.id}/avatar.png`, blob, { upsert: true, contentType: 'image/png', cacheControl: '0' });
      if (error) throw error;
      if (user?.id !== currentUser.id) return;
      const { data, error: updateError } = await client.auth.updateUser({ data: { avatar_version: String(Date.now()) } });
      if (updateError) throw updateError;
      if (user?.id !== currentUser.id) return;
      render(data.user); message.textContent = '头像已保存，下次登录仍可使用。';
    } catch { if (user?.id === currentUser.id) message.textContent = '头像保存失败，请稍后重试。'; }
    finally { bitmap?.close(); event.target.disabled = false; event.target.value = ''; }
  });

  async function initialize() {
    $('#email-login')?.toggleAttribute('hidden', !config.emailEnabled);
    controls(); status('正在确认登录状态…');
    try {
      // Only a publishable key is accepted, so privileged keys cannot be used accidentally.
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl || '') || !/^sb_publishable_/.test(config.publishableKey || '')) {
        ready = true; render(null); status('登录服务即将开放，请稍后再来。'); return;
      }
      client = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' }
      });
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return;
        authRevision++; render(session?.user || null);
        if (event === 'SIGNED_OUT') status('已退出登录。');
      });
      const revision = authRevision;
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      let verifiedUser = null;
      if (sessionData.session) {
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        verifiedUser = data.user;
      }
      ready = true;
      if (revision === authRevision) render(verifiedUser);
      controls(); status('');
    } catch {
      ready = true; render(null); status('无法确认登录状态，请检查网络并刷新页面。');
    }
  }
  initialize();
})();
