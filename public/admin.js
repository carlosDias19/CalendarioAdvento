const loginSection = document.querySelector('#adminLogin');
const panelSection = document.querySelector('#adminPanel');
const loginForm = document.querySelector('#adminLoginForm');
const loginError = document.querySelector('#adminLoginError');
const dayList = document.querySelector('#adminDayList');
const dayForm = document.querySelector('#dayForm');
const contentType = document.querySelector('#contentType');
const mediaUrl = document.querySelector('#mediaUrl');
const mediaFile = document.querySelector('#mediaFile');
const toast = document.querySelector('#adminToast');
let csrfToken = '';
let selectedDay = 1;
let days = [];
let toastTimeout;
const typeNames = { verse: 'Versículo', challenge: 'Desafio', video: 'Vídeo', music: 'Música' };

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET') {
    if (!csrfToken) csrfToken = (await fetch('/api/csrf').then((response) => response.json())).token;
    headers['x-csrf-token'] = csrfToken;
  }
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir agora.');
  return data;
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
}
function setAuthenticated(yes) {
  loginSection.hidden = yes;
  panelSection.hidden = !yes;
}
function shortPreview(day) {
  return day.reference || day.title || day.content || day.media_url || 'Conteúdo a definir';
}
function renderDays() {
  dayList.replaceChildren(...days.map((day) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `admin-day-button${day.day === selectedDay ? ' active' : ''}`;
    const number = document.createElement('span');
    number.className = 'day-list-number';
    number.textContent = day.day;
    const copy = document.createElement('span');
    copy.className = 'day-list-copy';
    const type = document.createElement('span');
    type.className = 'day-list-type';
    type.textContent = typeNames[day.type] || 'Conteúdo';
    const preview = document.createElement('span');
    preview.className = 'day-list-preview';
    preview.textContent = shortPreview(day);
    copy.append(type, preview);
    const arrow = document.createElement('span');
    arrow.className = 'day-list-chevron';
    arrow.textContent = '›';
    button.append(number, copy, arrow);
    button.addEventListener('click', () => selectDay(day.day));
    return button;
  }));
  document.querySelector('#dayCount').textContent = String(days.length);
}
function updateFields() {
  const type = contentType.value;
  document.querySelector('#referenceGroup').hidden = type !== 'verse';
  document.querySelector('#titleGroup').hidden = type !== 'challenge';
  document.querySelector('#textGroup').hidden = type === 'video' || type === 'music';
  document.querySelector('#mediaGroup').hidden = type !== 'video' && type !== 'music';
  document.querySelector('#mediaHelp').textContent = type === 'video' ? 'Cole um link do YouTube ou Vimeo, ou envie um vídeo MP4 de até 50 MB.' : 'Cole um link de música ou envie um arquivo MP3 de até 30 MB.';
  mediaFile.accept = type === 'video' ? '.mp4,video/mp4' : '.mp3,audio/mpeg';
  const day = days.find((item) => item.day === selectedDay);
  const status = document.querySelector('#mediaStatus');
  const remove = document.querySelector('#removeMedia');
  status.textContent = day?.media_url ? `Mídia atual: ${day.media_url}` : '';
  remove.hidden = !day?.media_url;
}
function selectDay(number) {
  const day = days.find((item) => item.day === number);
  if (!day) return;
  selectedDay = number;
  renderDays();
  document.querySelector('#editorDayLabel').textContent = `Dia ${number}`;
  contentType.value = day.type;
  document.querySelector('#reference').value = day.reference || '';
  document.querySelector('#contentTitle').value = day.title || '';
  document.querySelector('#contentText').value = day.content || '';
  mediaUrl.value = day.media_url || '';
  mediaFile.value = '';
  document.querySelector('#saveMessage').textContent = '';
  updateFields();
}
async function loadDays() {
  days = await api('/api/admin/days');
  renderDays();
  selectDay(selectedDay);
  const daySelect = document.querySelector('#testDay');
  daySelect.replaceChildren(...days.map((day) => {
    const option = document.createElement('option');
    option.value = day.day;
    option.textContent = `Dia ${day.day} · ${typeNames[day.type]}`;
    return option;
  }));
}
async function loadUsers() {
  const users = await api('/api/admin/users');
  document.querySelector('#userCount').textContent = String(users.length);
  const list = document.querySelector('#userList');
  list.replaceChildren();
  if (!users.length) {
    list.textContent = 'Ainda não há contas comuns cadastradas.';
    return;
  }
  for (const user of users) {
    const row = document.createElement('div');
    row.className = 'user-row';
    const details = document.createElement('div');
    details.className = 'user-details';
    const name = document.createElement('strong');
    name.textContent = user.username;
    const created = document.createElement('small');
    created.textContent = `Criado em ${new Date(user.created_at).toLocaleDateString('pt-BR')}`;
    details.append(name, created);
    const actions = document.createElement('div');
    actions.className = 'user-actions';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Redefinir senha';
    reset.addEventListener('click', async () => {
      const password = window.prompt(`Nova senha para ${user.username} (mínimo de 8 caracteres):`);
      if (password === null) return;
      try {
        await api(`/api/admin/users/${user.id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) });
        showToast('Senha redefinida com sucesso.');
      } catch (error) { showToast(error.message); }
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-user';
    remove.textContent = 'Excluir';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Excluir o acesso de ${user.username}? O progresso dessa conta também será apagado.`)) return;
      try {
        await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
        await loadUsers();
        showToast('Acesso removido.');
      } catch (error) { showToast(error.message); }
    });
    actions.append(reset, remove);
    row.append(details, actions);
    list.append(row);
  }
}
async function loadActivity() {
  const filter = document.querySelector('#activityFilter').value;
  const query = filter === 'all' ? '' : `?type=${encodeURIComponent(filter)}`;
  const events = await api(`/api/admin/activity${query}`);
  const list = document.querySelector('#activityList');
  const empty = document.querySelector('#activityEmpty');
  list.replaceChildren();
  document.querySelector('#activityCount').textContent = `${events.length} ${events.length === 1 ? 'registro' : 'registros'}`;
  empty.hidden = events.length > 0;
  for (const activity of events) {
    const row = document.createElement('tr');
    const occurredAt = new Date(activity.occurred_at);
    const dateCell = document.createElement('td');
    const time = document.createElement('time');
    time.dateTime = activity.occurred_at;
    time.textContent = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    }).format(occurredAt);
    dateCell.append(time);

    const userCell = document.createElement('td');
    userCell.className = 'activity-user';
    const username = document.createElement('strong');
    username.textContent = activity.username;
    const role = document.createElement('small');
    role.textContent = activity.role === 'admin' ? 'Administração' : 'Participante';
    userCell.append(username, role);

    const actionCell = document.createElement('td');
    actionCell.textContent = activity.action === 'login'
      ? (activity.role === 'admin' ? 'Entrou no painel' : 'Entrou no calendário')
      : 'Abriu uma carta';

    const dayCell = document.createElement('td');
    dayCell.textContent = activity.action === 'open_day' ? `Dia ${activity.day}` : 'Não se aplica';
    row.append(dateCell, userCell, actionCell, dayCell);
    list.append(row);
  }
}
async function loadTestMode() {
  const mode = await api('/api/admin/test-mode');
  document.querySelector('#testMode').checked = mode.enabled;
  document.querySelector('#testDay').value = String(mode.day);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const button = loginForm.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: loginForm.username.value, password: loginForm.password.value }) });
    csrfToken = '';
    setAuthenticated(true);
    await Promise.all([loadDays(), loadUsers(), loadTestMode()]);
  } catch (error) { loginError.textContent = error.message; }
  finally { button.disabled = false; }
});

contentType.addEventListener('change', updateFields);
dayForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const save = dayForm.querySelector('.save-button');
  save.disabled = true;
  try {
    const updated = await api(`/api/admin/days/${selectedDay}`, {
      method: 'PUT',
      body: JSON.stringify({
        type: contentType.value,
        reference: document.querySelector('#reference').value,
        title: document.querySelector('#contentTitle').value,
        content: document.querySelector('#contentText').value,
        media_url: mediaUrl.value.trim()
      })
    });
    days = days.map((day) => day.day === selectedDay ? updated : day);
    renderDays();
    document.querySelector('#saveMessage').textContent = 'Alterações salvas.';
    updateFields();
  } catch (error) { document.querySelector('#saveMessage').textContent = error.message; }
  finally { save.disabled = false; }
});

document.querySelector('#uploadMedia').addEventListener('click', async () => {
  const file = mediaFile.files[0];
  const status = document.querySelector('#mediaStatus');
  if (!file) { status.textContent = 'Escolha um arquivo primeiro.'; return; }
  const isVideo = contentType.value === 'video';
  const validExtension = isVideo ? /\.mp4$/i.test(file.name) : /\.mp3$/i.test(file.name);
  const limit = isVideo ? 50 * 1024 * 1024 : 30 * 1024 * 1024;
  if (!validExtension) { status.textContent = isVideo ? 'Escolha um arquivo MP4.' : 'Escolha um arquivo MP3.'; return; }
  if (file.size > limit) { status.textContent = `O arquivo ultrapassa o limite de ${isVideo ? '50 MB' : '30 MB'}.`; return; }
  const formData = new FormData();
  formData.append('media', file);
  status.textContent = 'Enviando arquivo...';
  try {
    const result = await api(`/api/admin/days/${selectedDay}/media`, { method: 'POST', body: formData });
    mediaUrl.value = result.media_url;
    const current = days.find((day) => day.day === selectedDay);
    current.media_url = result.media_url;
    status.textContent = 'Arquivo enviado. Salve as alterações para concluir.';
    document.querySelector('#removeMedia').hidden = false;
    renderDays();
  } catch (error) { status.textContent = error.message; }
});

document.querySelector('#removeMedia').addEventListener('click', async () => {
  if (!window.confirm('Remover a mídia atual deste dia?')) return;
  try {
    await api(`/api/admin/days/${selectedDay}/media`, { method: 'DELETE' });
    mediaUrl.value = '';
    days.find((day) => day.day === selectedDay).media_url = '';
    document.querySelector('#mediaStatus').textContent = 'Mídia removida. Salve as alterações para concluir.';
    document.querySelector('#removeMedia').hidden = true;
    renderDays();
  } catch (error) { showToast(error.message); }
});

const tabs = document.querySelectorAll('.tab-button');
tabs.forEach((tab) => tab.addEventListener('click', async () => {
  tabs.forEach((item) => item.classList.toggle('active', item === tab));
  document.querySelectorAll('.admin-section').forEach((section) => {
    const active = section.id === `tab-${tab.dataset.tab}`;
    section.hidden = !active;
    section.classList.toggle('active', active);
  });
  if (tab.dataset.tab === 'users') await loadUsers();
  if (tab.dataset.tab === 'activity') await loadActivity();
}));

document.querySelector('#activityFilter').addEventListener('change', () => {
  loadActivity().catch((error) => showToast(error.message));
});
document.querySelector('#refreshActivity').addEventListener('click', () => {
  loadActivity().catch((error) => showToast(error.message));
});

document.querySelector('#createUserForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#userMessage');
  try {
    await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: form.username.value, password: form.password.value }) });
    form.reset();
    message.textContent = 'Acesso criado.';
    await loadUsers();
  } catch (error) { message.textContent = error.message; }
});

document.querySelector('#testModeForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const enabled = document.querySelector('#testMode').checked;
  const day = Number(document.querySelector('#testDay').value);
  try {
    await api('/api/admin/test-mode', { method: 'POST', body: JSON.stringify({ enabled, day }) });
    const preview = document.querySelector('#testPreview');
    if (!enabled) {
      preview.textContent = 'Ative o modo de teste para abrir uma prévia.';
      showToast('Modo de teste desativado.');
      return;
    }
    const data = await api(`/api/admin/preview/${day}`);
    const kind = typeNames[data.type];
    preview.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = `Dia ${day} · ${kind}`;
    preview.append(heading);
    for (const value of [data.reference, data.title, data.content].filter(Boolean)) {
      const body = document.createElement('p');
      body.textContent = value;
      preview.append(body);
    }
    if (data.media_url) {
      if (data.type === 'video' && /\.mp4(?:\?|$)/i.test(data.media_url)) {
        const player = document.createElement('video');
        player.src = data.media_url;
        player.controls = true;
        player.playsInline = true;
        preview.append(player);
      } else if (data.type === 'music' && /\.mp3(?:\?|$)/i.test(data.media_url)) {
        const player = document.createElement('audio');
        player.src = data.media_url;
        player.controls = true;
        preview.append(player);
      } else {
        const link = document.createElement('a');
        link.href = data.media_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = data.type === 'video' ? 'Abrir vídeo' : 'Abrir música';
        preview.append(link);
      }
    }
    if (!data.reference && !data.title && !data.content && !data.media_url) {
      const empty = document.createElement('p');
      empty.textContent = 'Surpresa em preparo! Volte mais tarde.';
      preview.append(empty);
    }
    showToast('Prévia atualizada sem alterar o progresso.');
  } catch (error) { showToast(error.message); }
});

document.querySelector('#adminPasswordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPassword = document.querySelector('#currentAdminPassword').value;
  const newPassword = document.querySelector('#newAdminPassword').value;
  const message = document.querySelector('#passwordMessage');
  try {
    await api('/api/admin/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
    event.currentTarget.reset();
    message.textContent = 'Senha atualizada.';
  } catch (error) { message.textContent = error.message; }
});

document.querySelector('#adminLogout').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST', body: '{}' });
    csrfToken = '';
    setAuthenticated(false);
    loginForm.reset();
  } catch (error) { showToast(error.message); }
});

(async function init() {
  try {
    const session = await api('/api/session');
    if (session.user?.role === 'admin') {
      setAuthenticated(true);
      await Promise.all([loadDays(), loadUsers(), loadTestMode()]);
    } else if (session.user?.role === 'user') {
      document.querySelector('.admin-login > p:not(.eyebrow)').textContent = 'Esta área é reservada à administração.';
      loginForm.hidden = true;
    } else {
      setAuthenticated(false);
    }
  } catch { setAuthenticated(false); }
})();
