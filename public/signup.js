const signupForm = document.querySelector('#signupForm');
const signupError = document.querySelector('#signupError');
let csrfToken = '';

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  signupError.textContent = '';
  const username = signupForm.username.value.trim();
  const password = signupForm.password.value;
  const confirmPassword = signupForm.confirmPassword.value;
  if (password !== confirmPassword) {
    signupError.textContent = 'As senhas não coincidem. Confira e tente novamente.';
    return;
  }
  const submitButton = signupForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    if (!csrfToken) csrfToken = (await fetch('/api/csrf').then((response) => response.json())).token;
    const response = await fetch('/api/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ username, password })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível criar sua conta agora.');
    submitButton.textContent = 'Conta criada! Abrindo o calendário…';
    window.location.assign('/');
  } catch (error) {
    signupError.textContent = error.message;
    submitButton.disabled = false;
  }
});
