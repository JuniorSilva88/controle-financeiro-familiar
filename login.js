import { supabase, supabaseConfigError, supabaseConfigMissing } from './supabase.js';

const authForm = document.getElementById('email-auth-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const submitButton = document.getElementById('email-submit');
const modeToggle = document.getElementById('auth-mode-toggle');
const errorBox = document.getElementById('login-error');
const progress = document.getElementById('login-progress');
const heading = document.getElementById('login-heading');
const description = document.getElementById('login-description');
const passwordHelp = document.getElementById('password-help');
let mode = 'signin';

function dashboardUrl() {
  const url = new URL('index.html', window.location.href);
  const inviteToken = new URLSearchParams(window.location.search).get('invite');
  if (inviteToken) url.searchParams.set('invite', inviteToken);
  return url.toString();
}

function setError(message) {
  errorBox.classList.remove('login-success');
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setSuccess(message) {
  errorBox.classList.add('login-success');
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setLoading(loading) {
  submitButton.disabled = loading;
  progress.hidden = !loading;
  if (loading) errorBox.hidden = true;
}

function displayAuthError(error) {
  const messages = {
    'Invalid login credentials': 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
    'Email not confirmed': 'Confirme seu e-mail pelo link enviado antes de entrar.',
    'User already registered': 'Este e-mail já tem uma conta. Escolha “Entrar” para acessar.',
    'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
    'Signup requires a valid password': 'Informe uma senha válida com pelo menos 6 caracteres.',
    'For security purposes, you can only request this after': 'Aguarde antes de tentar novamente.'
  };
  const message = Object.entries(messages).find(([phrase]) => error.message?.includes(phrase))?.[1]
    || error.message
    || 'Tente novamente em instantes.';
  setError(message);
}

function showMode(nextMode) {
  mode = nextMode;
  const creatingAccount = mode === 'signup';
  heading.textContent = creatingAccount ? 'Crie sua conta familiar.' : 'Seu lar financeiro começa aqui.';
  description.textContent = creatingAccount
    ? 'Cadastre seu e-mail para organizar as finanças da sua família.'
    : 'Entre com seu e-mail e senha para acessar o painel da sua família.';
  submitButton.textContent = creatingAccount ? 'Criar conta' : 'Entrar com e-mail';
  modeToggle.textContent = creatingAccount ? 'Já tem uma conta? Entrar' : 'Não tem uma conta? Criar conta';
  passwordHelp.textContent = creatingAccount
    ? 'Use pelo menos 6 caracteres. Você receberá um e-mail para confirmar o cadastro.'
    : 'Use a senha cadastrada nesta conta.';
  errorBox.hidden = true;
}

modeToggle.addEventListener('click', () => {
  showMode(mode === 'signin' ? 'signup' : 'signin');
});

if (supabaseConfigMissing || !supabase) {
  setError(`${supabaseConfigError || 'A configuração do Supabase está incompleta.'} Na Vercel, confira VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e publique um novo deploy.`);
  submitButton.disabled = true;
} else {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (data.session) window.location.replace(dashboardUrl());
  }).catch((error) => {
    console.error('Não foi possível restaurar a sessão:', error);
    setError('Não foi possível verificar sua sessão. Atualize a página e tente novamente.');
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) window.location.replace(dashboardUrl());
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const credentials = {
        email: emailInput.value.trim(),
        password: passwordInput.value
      };
      const emailRedirectUrl = new URL('login.html', window.location.href);
      const inviteToken = new URLSearchParams(window.location.search).get('invite');
      if (inviteToken) emailRedirectUrl.searchParams.set('invite', inviteToken);
      const result = mode === 'signup'
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: emailRedirectUrl.toString() }
          })
        : await supabase.auth.signInWithPassword(credentials);

      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        setSuccess('Conta criada. Abra o link de confirmação enviado ao seu e-mail e depois entre com sua senha.');
        return;
      }
      if (result.data.session) window.location.replace(dashboardUrl());
    } catch (error) {
      console.error('Falha na autenticação do Supabase:', error);
      displayAuthError(error);
    } finally {
      setLoading(false);
    }
  });

}
