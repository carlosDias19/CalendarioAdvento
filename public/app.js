const loginScreen = document.querySelector('#loginScreen');
const calendarScreen = document.querySelector('#calendarScreen');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const calendarGrid = document.querySelector('#calendarGrid');
const giftDialog = document.querySelector('#giftDialog');
const giftTitle = document.querySelector('#giftTitle');
const giftContent = document.querySelector('#giftContent');
const toast = document.querySelector('#toast');
let csrfToken = '';
let toastTimer;

const decorations = ['❄', '✿', '✧', '✦', '❧', '✳', '♟', '❋', '❀', '❖', '✶', '✺', '❃', '❊', '✵', '❈', '✥', '❉', '✴', '❋', '✷', '✧', '❅', '♧', '✦'];
const typeNames = { verse: 'Versículo', challenge: 'Desafio', video: 'Vídeo', music: 'Música' };

async function request(url, options = {}) {
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
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3300);
}

function setScreen(isAuthenticated) {
  loginScreen.hidden = isAuthenticated;
  calendarScreen.hidden = !isAuthenticated;
}

function createCard(dayInfo) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `day-card day-${dayInfo.day} ${['paper', 'gold', 'red'][((dayInfo.day * 7) + dayInfo.day) % 3]}`;
  if ([2, 4, 7, 9, 12, 15, 17, 21, 24].includes(dayInfo.day)) card.classList.add('paper');
  else if ([3, 6, 11, 19, 23].includes(dayInfo.day)) card.classList.add('gold');
  else card.classList.add('red');
  card.setAttribute('aria-label', `Dia ${dayInfo.day}${dayInfo.opened ? ', já aberto' : ''}${!dayInfo.available ? ', bloqueado' : ''}`);
  const art = document.createElement('span');
  art.className = 'day-art';
  art.setAttribute('aria-hidden', 'true');
  art.textContent = decorations[dayInfo.day - 1];
  const number = document.createElement('span');
  number.className = 'day-number';
  number.textContent = String(dayInfo.day);
  card.append(art, number);
  if (dayInfo.opened) card.classList.add('opened');
  if (!dayInfo.available) {
    card.classList.add('locked');
    card.setAttribute('aria-disabled', 'true');
    const lock = document.createElement('span');
    lock.className = 'day-lock';
    lock.textContent = '⌑';
    lock.setAttribute('aria-hidden', 'true');
    card.append(lock);
  }
  card.addEventListener('click', () => {
    if (!dayInfo.available) {
      showToast(`Calma! Este presente só abre no dia ${dayInfo.day} de dezembro.`);
      return;
    }
    revealDay(dayInfo.day, card);
  });
  return card;
}

async function loadCalendar() {
  const days = await request('/api/days');
  calendarGrid.replaceChildren(...days.map(createCard));
  const openedCount = days.filter((day) => day.opened).length;
  document.querySelector('#progressText').textContent = `${openedCount} de 25 janelas abertas`;
}

function embedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const videoId = parsed.searchParams.get('v');
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live', 'v'].includes(pathParts[0]) && pathParts[1]) {
        return `https://www.youtube-nocookie.com/embed/${pathParts[1]}`;
      }
    }
    if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/embed/')) return `https://www.youtube-nocookie.com${parsed.pathname}`;
    }
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {}
  return '';
}

function showModal(day, data) {
  const title = data.type === 'verse' ? data.reference || 'Versículo' : data.type === 'challenge' ? 'Desafio' : typeNames[data.type];
  giftTitle.textContent = title;
  document.querySelector('#dialogKicker').textContent = `Dia ${day} de dezembro`;
  giftContent.replaceChildren();
  if (data.type === 'verse') {
    const reference = document.createElement('p');
    reference.className = 'scripture';
    reference.textContent = data.reference;
    const message = document.createElement('p');
    message.className = 'message';
    message.textContent = data.content || 'Surpresa em preparo! Volte mais tarde.';
    giftContent.append(reference, message);
  } else if (data.type === 'challenge') {
    const message = document.createElement('p');
    message.className = 'message';
    message.textContent = data.content || 'Surpresa em preparo! Volte mais tarde.';
    giftContent.append(message);
  } else if (data.type === 'video') {
    const videoEmbed = embedUrl(data.media_url || '');
    if (videoEmbed) {
      const frame = document.createElement('div');
      frame.className = 'media-frame';
      const iframe = document.createElement('iframe');
      iframe.src = videoEmbed;
      iframe.title = `Vídeo do dia ${day}`;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      frame.append(iframe);
      giftContent.append(frame);
      const externalLink = document.createElement('a');
      externalLink.className = 'video-fallback';
      externalLink.href = data.media_url;
      externalLink.target = '_blank';
      externalLink.rel = 'noopener noreferrer';
      externalLink.textContent = 'Abrir vídeo em outra aba';
      giftContent.append(externalLink);
    } else if (data.media_url) {
      const frame = document.createElement('div');
      frame.className = 'media-frame';
      const player = document.createElement('video');
      player.src = data.media_url;
      player.controls = true;
      player.playsInline = true;
      frame.append(player);
      giftContent.append(frame);
      if (/^https:\/\//i.test(data.media_url)) {
        const externalLink = document.createElement('a');
        externalLink.className = 'video-fallback';
        externalLink.href = data.media_url;
        externalLink.target = '_blank';
        externalLink.rel = 'noopener noreferrer';
        externalLink.textContent = 'Abrir vídeo em outra aba';
        giftContent.append(externalLink);
      }
    } else {
      giftContent.innerHTML = '<p class="surprise">Surpresa em preparo! Volte mais tarde.</p>';
    }
  } else if (data.type === 'music') {
    if (!data.media_url) {
      giftContent.innerHTML = '<p class="surprise">Surpresa em preparo! Volte mais tarde.</p>';
    } else {
      giftContent.className = 'gift-content music-content';
      request(`/api/days/${day}/qr`).then(({ dataUrl }) => {
        const qrWrap = document.createElement('div');
        qrWrap.className = 'qr-wrap';
        const qr = document.createElement('img');
        qr.src = dataUrl;
        qr.alt = 'QR Code para abrir a música';
        const logo = document.createElement('span');
        logo.className = 'qr-logo';
        logo.textContent = 'N';
        qrWrap.append(qr, logo);
        if (giftDialog.open) giftContent.prepend(qrWrap);
      }).catch(() => {});
      if (/\.mp3(?:\?|$)/i.test(data.media_url)) {
        const player = document.createElement('audio');
        player.className = 'audio-player';
        player.src = data.media_url;
        player.controls = true;
        giftContent.append(player);
      } else {
        const link = document.createElement('a');
        link.className = 'listen-link';
        link.href = data.media_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Ouvir agora';
        giftContent.append(link);
      }
    }
  }
  giftDialog.showModal();
}

async function revealDay(day, card) {
  card.classList.add('opening');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : 800));
  try {
    const data = await request(`/api/days/${day}/open`, { method: 'POST', body: JSON.stringify({}) });
    card.classList.remove('opening');
    card.classList.add('opened');
    card.setAttribute('aria-label', `Dia ${day}, já aberto`);
    document.querySelector('#progressText').textContent = `${document.querySelectorAll('.day-card.opened').length} de 25 janelas abertas`;
    showModal(day, data);
  } catch (error) {
    card.classList.remove('opening');
    showToast(error.message);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    await request('/api/login', { method: 'POST', body: JSON.stringify({ username: loginForm.username.value, password: loginForm.password.value }) });
    csrfToken = '';
    setScreen(true);
    await loadCalendar();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    await request('/api/logout', { method: 'POST', body: '{}' });
    csrfToken = '';
    setScreen(false);
    loginForm.reset();
  } catch (error) { showToast(error.message); }
});

document.querySelector('#dialogClose').addEventListener('click', () => giftDialog.close());
giftDialog.addEventListener('click', (event) => { if (event.target === giftDialog) giftDialog.close(); });

(async function init() {
  try {
    const session = await request('/api/session');
    if (session.authenticated && session.user?.role === 'user') {
      setScreen(true);
      await loadCalendar();
    } else {
      setScreen(false);
    }
  } catch { setScreen(false); }
})();
