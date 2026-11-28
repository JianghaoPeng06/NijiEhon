/* Supabase owns identity, tokens, refresh and cross-tab session synchronization. */
(() => {
  const $ = selector => document.querySelector(selector);
  const config = window.NIJI_AUTH_CONFIG || {};
  const form = $('#login');
  const card = $('#account-card');
  const loginEmail = $('#login-email');
  const loginPassword = $('#login-password');
  const loginPasswordConfirm = $('#login-password-confirm');
  const loginPasswordField = loginPassword?.closest('.password-field');
  const loginConfirmField = loginPasswordConfirm?.closest('.password-field');
  const loginCode = $('#login-code');
  const resendButton = $('#resend-code');
  const passwordSettings = $('#password-settings');
  const passwordForm = $('#password-settings-form');
  const passwordStatus = $('#password-status');
  const passwordHelp = $('#password-help');
  const settings = $('#settings-dialog');
  const settingsButton = $('#account-settings');
  const profileForm = $('#profile-settings-form');
  const nickname = $('#account-nickname');
  const footerLogin = $('footer a[href="index.html#login"]');
  const defaultAvatar = 'assets/default-avatar.png';
  const loginViews = {
    password: { title: '登录以使用完整功能', hint: '使用邮箱和密码登录', submit: '登录' },
    signup: { title: '创建账号', hint: '使用邮箱注册，密码至少 8 个字符', submit: '注册并发送验证码' },
    otp: { title: '验证码登录', hint: '使用邮箱验证码登录，首次验证可创建账号', submit: '获取邮箱验证码' },
    recovery: { title: '找回密码', hint: '输入账号邮箱，获取重置验证码', submit: '发送重置验证码' }
  };
  let client, user = null, ready = false, busy = false, sentEmail = '', resendAt = 0;
  let loginMode = 'password', recoveryUserId = '';
  let avatarObjectUrl, avatarRevision = 0, avatarSignature = '';
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
    if (error?.code === 'invalid_credentials') return '邮箱或密码有误。如果还未设置密码，请使用验证码登录。';
    if (error?.code === 'email_not_confirmed') return '请先验证邮箱，也可以使用验证码登录。';
    if (error?.code === 'weak_password') return '密码不符合安全要求，请换一个更长或更复杂的密码。';
    if (error?.code === 'same_password') return '新密码需要与原密码不同。';
    if (error?.code === 'reauthentication_needed') return '请重新登录后再设置密码。';
    if (error?.code === 'user_already_exists') return '请尝试登录。如果忘记密码，可以通过邮箱找回。';
    return '暂时无法完成操作，请检查网络后重试。';
  }
  function updateResend() {
    if (!resendButton || !sentEmail) return;
    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    resendButton.disabled = !ready || !client || busy || seconds > 0;
    resendButton.textContent = seconds ? `${seconds} 秒后重发` : '重新发送验证码';
  }
  function showPassword(button, visible) {
    document.getElementById(button.getAttribute('aria-controls')).type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
  }
  function concealPasswords(container) {
    container?.querySelectorAll('.password-toggle[aria-pressed="true"]').forEach(button => showPassword(button, false));
  }
  document.querySelectorAll('.password-toggle').forEach(button => {
    button.addEventListener('click', () => showPassword(button, button.getAttribute('aria-pressed') === 'false'));
  });
  function controls() {
    const disabled = !ready || !client || busy;
    document.querySelectorAll('[data-auth-control]').forEach(node => { node.disabled = disabled; });
    if (form) {
      const resetting = !!recoveryUserId;
      const checkingCode = !!sentEmail && !resetting;
      const usePassword = resetting || (!sentEmail && ['password', 'signup'].includes(loginMode));
      const newPassword = loginMode !== 'password';
      const view = loginViews[loginMode];
      $('#login-title').textContent = resetting ? '设置新密码' : view.title;
      $('#login-hint').textContent = resetting ? '新密码至少 8 个字符' : checkingCode ? '输入邮件中的验证码' : view.hint;
      loginEmail.readOnly = !!sentEmail;
      loginEmail.hidden = resetting;
      loginEmail.disabled = disabled || resetting;
      loginPasswordField.hidden = !usePassword;
      loginPassword.disabled = disabled || !usePassword;
      loginPassword.required = usePassword;
      loginPassword.autocomplete = newPassword ? 'new-password' : 'current-password';
      loginPassword.minLength = newPassword ? 8 : 0;
      loginPassword.placeholder = newPassword ? '输入新密码' : '输入密码';
      loginConfirmField.hidden = !usePassword || !newPassword;
      loginPasswordConfirm.disabled = disabled || loginConfirmField.hidden;
      loginPasswordConfirm.required = !loginConfirmField.hidden;
      loginCode.required = checkingCode;
      loginCode.disabled = disabled || !checkingCode;
      $('#email-code-step').hidden = !checkingCode;
      $('#email-submit').textContent = resetting ? '保存新密码' : checkingCode ? '验证邮箱' : view.submit;
      $('#login-options').hidden = resetting;
      $('#cancel-recovery').hidden = !resetting;
      document.querySelectorAll('[data-login-mode]').forEach(button => { button.hidden = button.dataset.loginMode === loginMode; });
      form.setAttribute('aria-busy', String(busy || !ready));
      updateResend();
    }
    if (passwordForm) {
      passwordForm.setAttribute('aria-busy', String(busy || !ready));
      passwordForm.querySelectorAll('[data-auth-control]').forEach(node => { node.disabled = disabled || !user; });
    }
    if (settingsButton) settingsButton.disabled = !ready;
  }
  function clearLogin() {
    loginMode = 'password';
    recoveryUserId = '';
    sentEmail = '';
    form?.reset();
    concealPasswords(form);
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
    const resetting = !!user && user.id === recoveryUserId;
    if (changedUser) {
      document.querySelectorAll('.account-dialog[open]').forEach(dialog => dialog.close());
      if (!resetting) clearLogin();
      if ($('#avatar-status')) $('#avatar-status').textContent = '';
    }
    const name = user ? (user.user_metadata?.nickname || user.user_metadata?.full_name || user.email?.split('@')[0] || '我的账户') : '访客';
    const href = user ? 'account.html' : 'index.html#login';
    for (const link of [$('.login'), footerLogin]) {
      if (link) { link.textContent = user ? '个人中心' : '登录'; link.href = href; }
    }
    $('header .avatar')?.setAttribute('aria-label', user ? '个人中心' : '个人中心（未登录）');
    if (form) form.hidden = !!user && !resetting;
    if (card) card.hidden = !user || resetting;
    document.querySelectorAll('[data-account-name]').forEach(node => { node.textContent = name; });
    if ($('#name')) $('#name').textContent = name;
    if ($('#email')) $('#email').textContent = user?.email || '';
    if (passwordHelp) {
      const passwordConfigured = user?.user_metadata?.password_configured;
      passwordHelp.hidden = !user || passwordConfigured === true;
      passwordHelp.textContent = passwordConfigured === false ? '现在设置密码' : '密码设置帮助';
      $('#password-help-message').textContent = passwordConfigured === false
        ? '你的账号还没有设置密码。请前往个人中心右上角的「设置」设置密码。'
        : '如果还没有设置密码，请前往个人中心右上角的「设置」设置密码。';
      passwordSettings.querySelector('summary').textContent = passwordConfigured === true ? '修改密码'
        : passwordConfigured === false ? '设置密码' : '设置或修改密码';
    }
    if ($('#password-account-email')) $('#password-account-email').value = user?.email || '';
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
  async function action(task, report = status) {
    if (!ready || !client || busy) return;
    busy = true; controls(); report('');
    try { await task(); } catch (error) { report(errorMessage(error)); }
    finally { busy = false; controls(); }
  }
  function passwordIssue(password, confirm) {
    if ([...password].length < 8 || new TextEncoder().encode(password).length > 72) return '密码需要至少 8 个字符，且不超过 72 字节。';
    return password === confirm ? '' : '两次输入的密码不一致。';
  }
  function signedIn(nextUser, message = '登录成功。') {
    clearLogin();
    render(nextUser);
    status(message);
    $('#account-card a')?.focus();
  }
  function beginRecovery(nextUser) {
    if (loginMode === 'recovery' && sentEmail && nextUser?.email?.toLowerCase() === sentEmail.toLowerCase()) {
      recoveryUserId = nextUser.id;
    }
  }
  async function sendCode() {
    if (Date.now() < resendAt) { status('请等待倒计时结束后再发送。'); return; }
    const email = sentEmail || loginEmail.value.trim();
    const mode = loginMode;
    let result;
    if (mode === 'signup' && !sentEmail) {
      const issue = passwordIssue(loginPassword.value, loginPasswordConfirm.value);
      if (issue) { status(issue); return; }
      result = await client.auth.signUp({ email, password: loginPassword.value, options: { data: { password_configured: true } } });
    } else if (mode === 'signup') {
      result = await client.auth.resend({ type: 'signup', email });
    } else if (mode === 'recovery') {
      result = await client.auth.resetPasswordForEmail(email);
    } else {
      result = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: { password_configured: false } } });
    }
    if (result.error) throw result.error;
    if (mode === 'signup' && result.data.session) { signedIn(result.data.user); return; }
    if (loginMode !== mode || user) return;
    sentEmail = email; resendAt = Date.now() + 60000;
    loginPassword.value = ''; loginPasswordConfirm.value = ''; loginCode.value = '';
    concealPasswords(form);
    status(mode === 'recovery'
      ? '如果此邮箱已有账号，重置验证码将发送到该邮箱。'
      : '请查收邮箱验证码，也可检查垃圾邮件。');
  }
  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (!config.emailEnabled) return;
    action(async () => {
      if (loginMode === 'password') {
        const { data, error } = await client.auth.signInWithPassword({ email: loginEmail.value.trim(), password: loginPassword.value });
        if (error) throw error;
        signedIn(data.user);
        if (data.user.user_metadata?.password_configured !== true) {
          // A successful password login can confirm the display hint for older accounts.
          await client.auth.updateUser({ data: { password_configured: true } }).catch(() => {});
        }
        return;
      }
      if (recoveryUserId) {
        if (user?.id !== recoveryUserId) return;
        const issue = passwordIssue(loginPassword.value, loginPasswordConfirm.value);
        if (issue) { status(issue); return; }
        const { data, error } = await client.auth.updateUser({ password: loginPassword.value, data: { password_configured: true } });
        if (error) throw error;
        signedIn(data.user, '密码已重置，登录成功。');
        return;
      }
      if (!sentEmail) { await sendCode(); return; }
      const type = loginMode === 'recovery' ? 'recovery' : loginMode === 'signup' ? 'signup' : 'email';
      const { data, error } = await client.auth.verifyOtp({ email: sentEmail, token: loginCode.value.trim(), type });
      if (error) throw error;
      if (type === 'recovery') {
        beginRecovery(data.user);
        loginCode.value = '';
        render(data.user);
      } else signedIn(data.user);
    }).then(() => {
      if (recoveryUserId && !form.hidden) loginPassword.focus();
      else if (sentEmail && !loginCode.value && !form.hidden) loginCode.focus();
    });
  });
  resendButton?.addEventListener('click', () => action(sendCode).then(() => loginCode.focus()));
  $('#change-email')?.addEventListener('click', () => {
    if (busy) return;
    sentEmail = ''; loginCode.value = ''; controls(); status(''); loginEmail.focus();
  });
  document.querySelectorAll('[data-login-mode]').forEach(button => button.addEventListener('click', () => {
    if (busy || user) return;
    const email = loginEmail.value;
    clearLogin();
    loginMode = button.dataset.loginMode;
    loginEmail.value = email;
    controls(); status(''); loginEmail.focus();
  }));
  if (form) setInterval(updateResend, 1000);
  profileForm?.addEventListener('submit', event => {
    event.preventDefault();
    const currentUser = user;
    if (!currentUser) return;
    const profileStatus = $('#profile-status');
    const report = message => { if (user?.id === currentUser.id) profileStatus.textContent = message; };
    action(async () => {
      const value = nickname.value.trim();
      if (!value) { report('请输入昵称。'); return; }
      const { data, error } = await client.auth.updateUser({ data: { nickname: value } });
      if (error) throw error;
      if (user?.id !== currentUser.id) return;
      nickname.value = value;
      render(data.user);
      report('昵称已保存。');
    }, report);
  });
  passwordForm?.addEventListener('submit', event => {
    event.preventDefault();
    const currentUser = user;
    if (!currentUser) return;
    const report = message => { passwordStatus.textContent = message; };
    action(async () => {
      const password = $('#account-password').value;
      const issue = passwordIssue(password, $('#account-password-confirm').value);
      if (issue) { report(issue); return; }
      const { data, error } = await client.auth.updateUser({ password, data: { password_configured: true } });
      if (error) throw error;
      if (user?.id !== currentUser.id) return;
      render(data.user);
      passwordForm.reset();
      concealPasswords(passwordForm);
      $('#password-account-email').value = data.user.email || '';
      report('密码已保存，下次可以使用邮箱和密码登录。');
    }, message => { if (user?.id === currentUser.id) report(message); });
  });
  document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', () => {
    const settingsStatus = $('#settings-status');
    action(async () => {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      render(null); status('已退出登录。');
      if (form) loginEmail.focus(); else $('#account-login')?.focus();
    }, settingsStatus ? message => { settingsStatus.textContent = message; } : status);
  }));
  $('#account-back')?.addEventListener('click', () => {
    if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) history.back();
    else location.href = 'index.html';
  });
  function openSettings() {
    nickname.value = user.user_metadata?.nickname || user.user_metadata?.full_name || '';
    $('#profile-status').textContent = '';
    passwordStatus.textContent = '';
    $('#settings-status').textContent = '';
    settings.showModal();
  }
  document.querySelectorAll('.account-dialog').forEach(dialog => {
    const triggers = document.querySelectorAll(`[aria-controls="${dialog.id}"]`);
    triggers.forEach(trigger => trigger.addEventListener('click', () => {
      if (dialog.open) return;
      if (dialog === settings && !user) { location.href = 'index.html#login'; return; }
      if (dialog === settings) openSettings();
      else dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
    }));
    dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
    let backdropDown = false;
    const onBackdrop = event => {
      const box = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
    };
    dialog.addEventListener('pointerdown', event => { backdropDown = onBackdrop(event); });
    dialog.addEventListener('click', event => { if (backdropDown && onBackdrop(event)) dialog.close(); });
    dialog.addEventListener('close', () => {
      if (!dialog.open) triggers.forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
    });
  });
  if (settings) {
    settings.addEventListener('close', () => {
      if (settings.open) return;
      settings.querySelectorAll('details[open]').forEach(section => { section.open = false; });
      passwordForm.reset();
      concealPasswords(passwordForm);
      $('#password-account-email').value = user?.email || '';
    });
    $('#go-to-password-settings').addEventListener('click', () => {
      if (!user) return;
      $('#password-help-dialog').close();
      settingsButton.click();
      passwordSettings.open = true;
      $('#account-password').focus();
    });
  }
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
        if (event === 'PASSWORD_RECOVERY') beginRecovery(session?.user);
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
