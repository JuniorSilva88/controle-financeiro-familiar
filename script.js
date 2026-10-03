import { supabase, supabaseConfigMissing } from './supabase.js';

let currentUser = null;
let currentFamilyId = null;
let currentFamilyName = '';
let isFamilyOwner = false;
let processamentoUsuario = null;
let realtimeChannelSequence = 0;

const DEFAULT_CATEGORIAS = {
  Moradia: '#6366f1',
  Saúde: '#10b981',
  Educação: '#f59e0b',
  Alimentação: '#ef4444',
  Transporte: '#0ea5e9',
  Outros: '#64748b',
  Eventual: '#8b5cf6'
};

let userCategories = {};
let mergedCategories = { ...DEFAULT_CATEGORIAS };

let despesas = [];
let chart = null;
let chartType = 'bar';
let despesaSelecionada = null;
let unsubscribeSnapshot = null;
let unsubscribeCategories = null;
let unsubscribeRendas = null;
let rendasDict = {}; // { 'YYYY-MM': { id, renda1, renda2 } }

/* ---------- TEMP IMPORT ---------- */
// Botões de recriar e zerar removidos.

/* ---------- AUTH E COMPARTILHAMENTO ---------- */
const authBtn = document.getElementById('auth-btn');
authBtn.onclick = async () => {
  authBtn.disabled = true;
  try {
    if (currentUser) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } else {
      window.location.assign(criarUrlLogin());
    }
  } catch (error) {
    console.error('Erro ao sair:', error);
    showAlert('Não foi possível encerrar sua sessão. Tente novamente.');
  } finally {
    authBtn.disabled = false;
  }
};

function processarUsuario(user) {
  const userId = user?.id || null;
  if (processamentoUsuario?.userId === userId) return processamentoUsuario.promise;

  const promise = processarUsuarioInterno(user);
  const operation = { userId, promise };
  processamentoUsuario = operation;
  promise.finally(() => {
    if (processamentoUsuario === operation) processamentoUsuario = null;
  }).catch((error) => {
    console.error('Erro inesperado ao processar a sessão:', error);
  });
  return promise;
}

async function processarUsuarioInterno(user) {
  if (currentUser?.id === user?.id && currentFamilyId) return;
  await pararObservadores();
  currentUser = user;
  const profileContainer = document.getElementById('user-profile-container');
  const profileImg = document.getElementById('user-profile-img');
  
  if (user) {
    definirEstadoAutenticacao(true);
    
    // Setup Profile Image
    if (profileContainer && profileImg) {
      profileContainer.classList.remove('hidden');
      profileContainer.classList.add('flex');
      const profilePhoto = user.user_metadata?.avatar_url;
      if (profilePhoto) {
        profileImg.src = profilePhoto;
      } else {
        const name = user.user_metadata?.full_name || user.email || 'U';
        profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;
      }
      profileImg.title = user.user_metadata?.full_name || user.email || 'Perfil';
    }

    try {
      const inviteToken = new URLSearchParams(window.location.search).get('invite');
      await prepararFamilia(user, inviteToken);
      try {
        await configurarCompartilhamento();
      } catch (error) {
        console.error('Erro ao carregar o compartilhamento da família:', error);
        showAlert('A família foi carregada, mas não foi possível abrir as opções de convite. Verifique a configuração do Supabase.');
      }
      carregar();
      removerConviteDaUrl();
      await encerrarCarregamento();
    } catch (error) {
      console.error('Erro ao preparar os dados da família:', error);
      currentFamilyId = null;
      await encerrarCarregamento();
      if (error.code === 'family/invalid-invite') removerConviteDaUrl();
      const detail = error.message || 'Erro desconhecido ao preparar os dados da família.';
      showRetryAlert(
        `Sua sessão continua ativa, mas não foi possível carregar os dados da família. ${detail}`,
        () => processarUsuario(user)
      );
    }
  } else {
    window.location.replace(criarUrlLogin());
    despesas = [];
    currentFamilyId = null;
    currentFamilyName = '';
    isFamilyOwner = false;
    limparCompartilhamento();
    userCategories = {};
    mergedCategories = { ...DEFAULT_CATEGORIAS };
    renderCategorias();
    renderUI();
    await encerrarCarregamento();
  }
}

if (supabaseConfigMissing || !supabase) {
  window.location.replace(criarUrlLogin());
} else {
  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => processarUsuario(session?.user || null), 0);
  });
}

function criarUrlLogin() {
  const loginUrl = new URL('login.html', window.location.href);
  const inviteToken = new URLSearchParams(window.location.search).get('invite');
  if (inviteToken) loginUrl.searchParams.set('invite', inviteToken);
  return loginUrl.toString();
}

function definirEstadoAutenticacao(autenticado) {
  authBtn.innerHTML = `<span>${autenticado ? 'Sair' : 'Login'}</span>`;
  authBtn.classList.toggle('bg-primary-600', !autenticado);
  authBtn.classList.toggle('hover:bg-primary-700', !autenticado);
  authBtn.classList.toggle('bg-slate-600', autenticado);
  authBtn.classList.toggle('hover:bg-slate-700', autenticado);
  const profileContainer = document.getElementById('user-profile-container');
  if (profileContainer) profileContainer.classList.toggle('hidden', !autenticado);
}

async function prepararFamilia(user, inviteToken) {
  const { data: membership, error: membershipError } = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError) throw membershipError;

  let familyId = membership?.family_id;
  if (familyId && inviteToken) {
    showAlert('Esta conta já está vinculada a uma família e não pode entrar em outra automaticamente.');
  } else if (!familyId && inviteToken) {
    const { data, error } = await supabase.rpc('accept_family_invite', { p_token: inviteToken });
    if (error) {
      const invalidInvite = new Error('Este convite expirou, foi substituído ou já foi utilizado. Peça um novo link ao responsável.');
      invalidInvite.code = 'family/invalid-invite';
      throw invalidInvite;
    }
    const accepted = Array.isArray(data) ? data[0] : data;
    familyId = accepted.family_id;
    currentFamilyName = accepted.family_name;
    isFamilyOwner = false;
  } else if (!familyId) {
    const familyName = await solicitarNomeFamilia();
    if (!familyName) {
      const error = new Error('A criação da família foi cancelada. Entre novamente para tentar de novo.');
      error.code = 'family/setup-cancelled';
      throw error;
    }
    const { data, error } = await supabase.rpc('create_family', { p_name: familyName });
    if (error) throw error;
    const created = Array.isArray(data) ? data[0] : data;
    familyId = created.family_id;
    currentFamilyName = created.family_name;
    isFamilyOwner = true;
  }

  if (!familyId) throw new Error('Sua conta ainda não pertence a uma família. Use um convite ou crie uma família.');
  currentFamilyId = familyId;
  const { data: family, error: familyError } = await supabase
    .from('families')
    .select('name')
    .eq('id', familyId)
    .single();
  if (familyError) throw familyError;
  currentFamilyName = family.name;
  isFamilyOwner = membership?.role === 'owner' || isFamilyOwner;
}

function solicitarNomeFamilia() {
  const modal = document.getElementById('family-setup-modal');
  const form = document.getElementById('family-setup-form');
  const input = document.getElementById('family-name-input');
  const cancelButton = document.getElementById('family-setup-cancel');
  modal.classList.remove('hidden');
  input.focus();

  return new Promise((resolve) => {
    const finalizar = (name) => {
      modal.classList.add('hidden');
      form.removeEventListener('submit', submitHandler);
      cancelButton.removeEventListener('click', cancelHandler);
      resolve(name);
    };
    const submitHandler = (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name) finalizar(name);
    };
    const cancelHandler = () => finalizar('');
    form.addEventListener('submit', submitHandler);
    cancelButton.addEventListener('click', cancelHandler);
  });
}

async function configurarCompartilhamento() {
  const inviteInput = document.getElementById('invite-link');
  const copyButton = document.getElementById('copy-invite');
  const generateButton = document.getElementById('generate-invite');
  const familyNameLabel = document.getElementById('family-name-label');
  const sharingHint = document.getElementById('sharing-hint');
  familyNameLabel.textContent = currentFamilyName;
  inviteInput.value = '';
  copyButton.classList.add('hidden');
  generateButton.classList.toggle('hidden', !isFamilyOwner);
  sharingHint.textContent = isFamilyOwner
    ? 'Gere um link seguro para convidar pessoas para esta família.'
    : 'Somente o responsável pela família pode gerar o link de convite.';

  if (!isFamilyOwner) return;

  const { data: existingInvite, error: inviteError } = await supabase
    .from('family_invites')
    .select('token')
    .eq('family_id', currentFamilyId)
    .eq('active', true)
    .maybeSingle();
  if (inviteError) throw inviteError;
  if (existingInvite?.token) definirLinkConvite(existingInvite.token);

  generateButton.onclick = async () => {
    generateButton.disabled = true;
    try {
      const { data, error } = await supabase.rpc('create_family_invite');
      if (error) throw error;
      const token = Array.isArray(data) ? data[0] : data;
      definirLinkConvite(token);
    } catch (error) {
      console.error('Erro ao gerar convite:', error);
      showAlert(`Não foi possível gerar o convite. ${error.message || 'Verifique a instalação do Supabase.'}`);
    } finally {
      generateButton.disabled = false;
    }
  };

  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(inviteInput.value);
      copyButton.textContent = 'Copiado!';
      setTimeout(() => { copyButton.textContent = 'Copiar'; }, 2000);
    } catch (error) {
      console.error('Erro ao copiar o convite:', error);
      inviteInput.focus();
      inviteInput.select();
      showAlert('Não foi possível copiar automaticamente. Selecione e copie o link exibido.');
    }
  };
}

function definirLinkConvite(token) {
  const inviteInput = document.getElementById('invite-link');
  const copyButton = document.getElementById('copy-invite');
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set('invite', token);
  inviteInput.value = inviteUrl.toString();
  copyButton.classList.remove('hidden');
}

function limparCompartilhamento() {
  document.getElementById('invite-link').value = '';
  document.getElementById('copy-invite').classList.add('hidden');
  document.getElementById('generate-invite').classList.add('hidden');
  document.getElementById('family-name-label').textContent = '';
  document.getElementById('sharing-hint').textContent = 'Entre para configurar o compartilhamento familiar.';
}

function removerConviteDaUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('invite')) return;
  url.searchParams.delete('invite');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function pararObservadores() {
  for (const unsubscribe of [unsubscribeSnapshot, unsubscribeCategories, unsubscribeRendas]) {
    if (unsubscribe) await unsubscribe();
  }
  unsubscribeSnapshot = null;
  unsubscribeCategories = null;
  unsubscribeRendas = null;
  despesas = [];
  rendasDict = {};
}

async function encerrarCarregamento() {
  const loader = document.getElementById('initial-loader');
  if (!loader) return;
  loader.style.opacity = '0';
  setTimeout(() => loader.classList.add('hidden'), 300);
}

function databaseErrorMessage(error) {
  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'O Supabase recusou esta operação. Verifique as políticas de segurança RLS do projeto.';
  }
  if (error.message?.includes('Failed to fetch')) {
    return 'Não foi possível conectar ao Supabase. Confira a URL e a chave pública no arquivo .env.';
  }
  return `Não foi possível concluir a operação no Supabase. ${error.message || 'Tente novamente.'}`;
}

function expenseToRow(expense) {
  return {
    nome: expense.nome,
    valor: expense.valor,
    tipo: expense.tipo,
    data_vencimento: expense.dataVencimento,
    pago: expense.pago,
    mes: expense.mes,
    categoria: expense.categoria,
    group_id: expense.groupId || null
  };
}

function expenseFromRow(row) {
  return {
    ...row,
    userId: row.user_id,
    familyId: row.family_id,
    dataVencimento: row.data_vencimento,
    groupId: row.group_id,
    createdAt: row.created_at
  };
}

function listenToFamilyTable(table, onData, onError) {
  const channelTopic = `${table}-${currentFamilyId}-${++realtimeChannelSequence}`;
  const load = async () => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('family_id', currentFamilyId);
    if (error) {
      onError(error);
      return;
    }
    onData(data || []);
  };
  load();
  const channel = supabase
    .channel(channelTopic)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `family_id=eq.${currentFamilyId}`
    }, load)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(error || new Error(`Falha na atualização em tempo real: ${table}`));
      }
    });
  return () => supabase.removeChannel(channel);
}

/* ---------- ARMAZENAMENTO (Supabase) ---------- */
async function salvar(novaDespesa) {
  if (!currentUser || !currentFamilyId) return showAlert('Entre em uma família para salvar despesas.');
  
  try {
    const { error } = await supabase.from('despesas').insert({
      ...expenseToRow(novaDespesa),
      user_id: currentUser.id,
      family_id: currentFamilyId
    });
    if (error) throw error;
  } catch (error) {
    console.error('Erro ao adicionar documento: ', error);
    showAlert(databaseErrorMessage(error));
  }
}

async function atualizarDespesa(d) {
  if (!currentUser || !currentFamilyId || !d.id) return;
  
  try {
    const { error } = await supabase.from('despesas')
      .update(expenseToRow(d))
      .eq('id', d.id)
      .eq('family_id', currentFamilyId);
    if (error) throw error;
  } catch (error) {
    console.error('Erro ao atualizar documento: ', error);
    showAlert(databaseErrorMessage(error));
  }
}

async function excluirDespesa(d, deleteAllRecurrences = false) {
  if (!currentUser || !currentFamilyId || !d.id) return;
  
  try {
    if (deleteAllRecurrences && d.groupId) {
      // Find all expenses with the same groupId
      const related = despesas.filter(item => item.groupId === d.groupId);
      const { error } = await supabase.from('despesas')
        .delete()
        .eq('family_id', currentFamilyId)
        .in('id', related.map(item => item.id));
      if (error) throw error;
    } else {
      const { error } = await supabase.from('despesas')
        .delete()
        .eq('id', d.id)
        .eq('family_id', currentFamilyId);
      if (error) throw error;
    }
  } catch (error) {
    console.error('Erro ao excluir documento(s): ', error);
    showAlert(databaseErrorMessage(error));
  }
}

function carregar() {
  if (!currentUser || !currentFamilyId) return;
  
  unsubscribeSnapshot = listenToFamilyTable('despesas', (rows) => {
    despesas = rows.map(expenseFromRow);
    renderUI();
    
    const loader = document.getElementById('initial-loader');
    if (loader && !loader.classList.contains('hidden')) {
      loader.style.opacity = '0';
      setTimeout(() => loader.classList.add('hidden'), 300);
    }
  }, (error) => {
    console.error('Erro ao buscar dados: ', error);
    showAlert(databaseErrorMessage(error));
  });

  unsubscribeCategories = listenToFamilyTable('categorias', (rows) => {
    userCategories = {};
    rows.forEach((row) => { userCategories[row.nome] = { id: row.id, cor: row.cor }; });
    mergedCategories = { ...DEFAULT_CATEGORIAS };
    for (const [name, catData] of Object.entries(userCategories)) {
      mergedCategories[name] = catData.cor;
    }
    
    renderCategorias();
    if (chart) renderUI(); // Re-render to update colors if needed
  }, (error) => {
    console.error('Erro ao buscar categorias: ', error);
    showAlert(databaseErrorMessage(error));
  });

  unsubscribeRendas = listenToFamilyTable('rendas', (rows) => {
    rendasDict = {};
    rows.forEach((row) => {
      if (row.mes) rendasDict[row.mes] = { id: row.id, renda1: row.renda1 || 0, renda2: row.renda2 || 0 };
    });
    renderUI();
  }, (error) => {
    console.error('Erro ao buscar rendas: ', error);
    showAlert(databaseErrorMessage(error));
  });
}

/* ---------- CATEGORIES RENDER ---------- */
function renderCategorias() {
  // Update Dropdowns
  const selectAdd = document.getElementById('categoria');
  const selectEdit = document.getElementById('edit-categoria');

  if (selectAdd && selectEdit) {
    const currentValueAdd = selectAdd.value;
    const currentValueEdit = selectEdit.value;

    selectAdd.innerHTML = '';
    selectEdit.innerHTML = '';

    Object.keys(mergedCategories).sort().forEach(cat => {
      const optionAdd = document.createElement('option');
      optionAdd.value = cat;
      optionAdd.textContent = cat;
      selectAdd.appendChild(optionAdd);

      const optionEdit = document.createElement('option');
      optionEdit.value = cat;
      optionEdit.textContent = cat;
      selectEdit.appendChild(optionEdit);
    });

    if (mergedCategories[currentValueAdd]) selectAdd.value = currentValueAdd;
    if (mergedCategories[currentValueEdit]) selectEdit.value = currentValueEdit;
  }

  // Update Settings List
  const catList = document.getElementById('settings-cat-list');
  if (catList) {
    catList.innerHTML = '';
    Object.keys(mergedCategories).sort().forEach(cat => {
      const isCustom = !!userCategories[cat];
      const color = mergedCategories[cat];

      const item = document.createElement('li');
      item.className = 'flex justify-between items-center px-4 py-2 hover:bg-white transition-colors group';

      const leftContent = document.createElement('div');
      leftContent.className = 'flex items-center gap-3';

      const colorDot = document.createElement('span');
      colorDot.className = 'w-4 h-4 rounded-full';
      colorDot.style.backgroundColor = color;

      const label = document.createElement('span');
      label.className = 'text-sm font-medium text-slate-700';
      label.textContent = cat;

      leftContent.append(colorDot, label);
      item.appendChild(leftContent);

      if (isCustom) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'text-slate-400 hover:text-red-500 p-1 rounded transition-colors';
        deleteBtn.title = 'Excluir categoria';
        deleteBtn.setAttribute('aria-label', `Excluir categoria ${cat}`);
        deleteBtn.addEventListener('click', () => {
          window.excluirCategoria(userCategories[cat].id, cat);
        });

        const deleteIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        deleteIcon.setAttribute('class', 'w-4 h-4');
        deleteIcon.setAttribute('fill', 'none');
        deleteIcon.setAttribute('stroke', 'currentColor');
        deleteIcon.setAttribute('viewBox', '0 0 24 24');

        const deletePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        deletePath.setAttribute('stroke-linecap', 'round');
        deletePath.setAttribute('stroke-linejoin', 'round');
        deletePath.setAttribute('stroke-width', '2');
        deletePath.setAttribute('d', 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16');

        deleteIcon.appendChild(deletePath);
        deleteBtn.appendChild(deleteIcon);
        item.appendChild(deleteBtn);
      } else {
        const defaultBadge = document.createElement('span');
        defaultBadge.className = 'text-[10px] text-slate-400 font-medium uppercase px-2';
        defaultBadge.textContent = 'Padrão';
        item.appendChild(defaultBadge);
      }

      catList.appendChild(item);
    });
  }
}

// Global functions for inline onclick
window.excluirCategoria = async (docId, catName) => {
  showConfirm(`Excluir a categoria "${catName}"?`, async () => {
    try {
      const { error } = await supabase.from('categorias')
        .delete()
        .eq('id', docId)
        .eq('family_id', currentFamilyId);
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao excluir categoria:', error);
      showAlert(databaseErrorMessage(error));
    }
  });
};

/* ---------- SETTINGS MODAL ---------- */
const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings').onclick = () => settingsModal.classList.remove('hidden');
document.getElementById('close-settings').onclick = () => settingsModal.classList.add('hidden');

document.getElementById('add-category-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!currentUser || !currentFamilyId) return showAlert('Entre em uma família para criar categorias.');

  const nameInput = document.getElementById('new-cat-name');
  const colorInput = document.getElementById('new-cat-color');
  const name = nameInput.value.trim();
  const color = colorInput.value;

  if (!name) return;
  
  // Verify if it already exists (case-insensitive check against keys)
  const exists = Object.keys(mergedCategories).find(k => k.toLowerCase() === name.toLowerCase());
  if (exists) {
    showAlert('Esta categoria já existe.');
    return;
  }

  try {
    const { error } = await supabase.from('categorias').insert({
      nome: name,
      cor: color,
      user_id: currentUser.id,
      family_id: currentFamilyId
    });
    if (error) throw error;
    nameInput.value = '';
    // Color input keeps its value
  } catch (error) {
    console.error('Erro ao adicionar categoria:', error);
    showAlert(databaseErrorMessage(error));
  }
};

function showAlert(msg) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4';

  const box = document.createElement('div');
  box.className = 'bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center';

  const message = document.createElement('p');
  message.className = 'text-slate-800 dark:text-slate-200 font-medium mb-6';
  message.textContent = msg;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg w-full transition-colors';
  button.textContent = 'OK';
  button.addEventListener('click', () => overlay.remove());

  box.append(message, button);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function showRetryAlert(msg, onRetry) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4';

  const box = document.createElement('div');
  box.className = 'bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center';

  const message = document.createElement('p');
  message.className = 'text-slate-800 dark:text-slate-200 font-medium mb-6';
  message.textContent = msg;

  const actions = document.createElement('div');
  actions.className = 'flex gap-3';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg transition-colors';
  closeButton.textContent = 'Fechar';
  closeButton.addEventListener('click', () => overlay.remove());

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'flex-1 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors';
  retryButton.textContent = 'Tentar novamente';
  retryButton.addEventListener('click', () => {
    overlay.remove();
    onRetry();
  });

  actions.append(closeButton, retryButton);
  box.append(message, actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function showConfirm(msg, onConfirm, withRecurrence = false) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4';

  const box = document.createElement('div');
  box.className = 'bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center';

  const message = document.createElement('p');
  message.className = `text-slate-800 dark:text-slate-200 font-medium ${withRecurrence ? 'mb-2' : 'mb-6'}`;
  message.textContent = msg;

  const actions = document.createElement('div');
  actions.className = 'flex gap-3 justify-center';

  let recurrenceCheckbox = null;

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.id = 'custom-confirm-cancel';
  cancelButton.className = 'flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg transition-colors';
  cancelButton.textContent = 'Cancelar';
  cancelButton.addEventListener('click', () => overlay.remove());

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.id = 'custom-confirm-ok';
  confirmButton.className = 'flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors';
  confirmButton.textContent = 'Confirmar';
  confirmButton.addEventListener('click', () => {
    const isChecked = withRecurrence && recurrenceCheckbox ? recurrenceCheckbox.checked : false;
    overlay.remove();
    onConfirm(isChecked);
  });

  actions.append(cancelButton, confirmButton);

  if (withRecurrence) {
    const recurrenceLabel = document.createElement('label');
    recurrenceLabel.className = 'flex items-center gap-2 mt-4 mb-6 cursor-pointer text-left bg-red-50 p-3 rounded-lg border border-red-100';

    recurrenceCheckbox = document.createElement('input');
    recurrenceCheckbox.type = 'checkbox';
    recurrenceCheckbox.id = 'delete-recurrences';
    recurrenceCheckbox.className = 'w-4 h-4 text-red-600 rounded border-red-300 focus:ring-red-500';

    const recurrenceText = document.createElement('span');
    recurrenceText.className = 'text-sm text-red-800';
    recurrenceText.textContent = 'Excluir também todas as outras parcelas/repetições desta(s) despesa(s)';

    recurrenceLabel.append(recurrenceCheckbox, recurrenceText);
    box.append(message, recurrenceLabel, actions);
  } else {
    box.append(message, actions);
  }

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}


/* ---------- HELPERS ---------- */
function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

function isAtrasado(d) {
  if (d.pago) return false;
  if (!d.dataVencimento) return false;
  // Get today's local date string as YYYY-MM-DD
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return d.dataVencimento < hojeStr;
}

/* ---------- MODAL ADD ---------- */
const addModal = document.getElementById('add-modal');
document.getElementById('open-add-modal').onclick = () => {
  addModal.classList.remove('hidden');
};

const fecharAddModal = () => {
  addModal.classList.add('hidden');
  limparFormulario();
};

document.getElementById('cancel-add').onclick = fecharAddModal;
document.getElementById('cancel-add-icon').onclick = fecharAddModal;

/* ---------- FORM ---------- */
const nome = document.getElementById('nome');
const valor = document.getElementById('valor');
const tipo = document.getElementById('tipo');
const dataVencimento = document.getElementById('dataVencimento');
const parcelas = document.getElementById('parcelas');
const pago = document.getElementById('pago');
const categoria = document.getElementById('categoria');

const labelParcelas = document.getElementById('label-parcelas');
tipo.onchange = () => {
  if (tipo.value === 'Parcelado') {
    labelParcelas.innerText = 'Qtd. Parcelas';
    parcelas.placeholder = 'Ex: 12';
  } else {
    labelParcelas.innerText = 'Repetir (Meses)';
    parcelas.placeholder = '1 (Somente este mês)';
  }
};

/* ---------- ADD ---------- */
document.getElementById('add-btn').onclick = async () => {
  if (!nome.value || !valor.value || !dataVencimento.value) return showAlert('Preencha descrição, valor e vencimento');

  const isPago = pago.checked;
  const isParcelado = tipo.value === 'Parcelado';
  // Agora qualquer tipo de despesa pode ser repetido se o usuário informar um número de meses
  const numRepeticoes = Number(parcelas.value) || 1;
  const groupId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);

  for (let i = 0; i < numRepeticoes; i++) {
    // Treat the date in local timezone correctly to avoid off-by-one errors
    const [year, month, day] = dataVencimento.value.split('-').map(Number);
    const d = new Date(year, month - 1 + i, day);
    
    // Formatting back to YYYY-MM-DD
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    
    const vencStr = `${y}-${m}-${dd}`;
    const mesStr = `${y}-${m}`;
    
    // Somente adiciona o sufixo (1/X) se for de fato uma compra "Parcelada"
    const nomeFinal = (isParcelado && numRepeticoes > 1) ? `${nome.value} (${i + 1}/${numRepeticoes})` : nome.value;

    const novaDespesa = {
      nome: nomeFinal,
      valor: Number(valor.value),
      tipo: tipo.value,
      dataVencimento: vencStr,
      mes: mesStr,
      pago: isPago,
      categoria: categoria.value,
      groupId: numRepeticoes > 1 ? groupId : null // Only group if repeating
    };

    await salvar(novaDespesa);
  }

  fecharAddModal();
};

function limparFormulario() {
  nome.value = '';
  valor.value = '';
  tipo.value = 'Fixa';
  dataVencimento.value = '';
  parcelas.value = '';
  pago.checked = false;
  // Make sure label sets correctly
  labelParcelas.innerText = 'Repetir (Meses)';
  parcelas.placeholder = '1 (Somente este mês)';
}

/* ---------- GRÁFICO E UI ---------- */
const monthFilter = document.getElementById('month-filter');
const toggleChartBtn = document.getElementById('toggle-chart');

// Dash Metrics
const totalDisplay = document.getElementById('total-display');
const totalAbertoDisplay = document.getElementById('total-aberto');
const totalPagoDisplay = document.getElementById('total-pago');
const totalAtrasadoDisplay = document.getElementById('total-atrasado');

const totalFixasDisplay = document.getElementById('total-fixas');
const totalVariaveisDisplay = document.getElementById('total-variaveis');
const totalParceladoDisplay = document.getElementById('total-parcelado');
const mediaMensalDisplay = document.getElementById('media-mensal');

function checkUpcoming() {
  const banner = document.getElementById('upcoming-banner');
  const bannerText = document.getElementById('upcoming-text');
  if (!banner || !bannerText) return;

  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  
  const limites = new Date();
  limites.setDate(hoje.getDate() + 3);
  limites.setHours(23,59,59,999);

  const contasVencendo = despesas.filter(d => {
    if (d.pago || !d.dataVencimento) return false;
    const [y, m, day] = d.dataVencimento.split('-').map(Number);
    const dataVenc = new Date(y, m - 1, day);
    return dataVenc >= hoje && dataVenc <= limites;
  });

  if (contasVencendo.length > 0) {
    banner.classList.remove('hidden');
    if (contasVencendo.length === 1) {
      bannerText.innerText = `A conta "${contasVencendo[0].nome}" vence em breve (até 3 dias).`;
    } else {
      bannerText.innerText = `Você possui ${contasVencendo.length} contas vencendo nos próximos 3 dias.`;
    }
  } else {
    banner.classList.add('hidden');
  }
}

function renderUI() {
  checkUpcoming();
  checkDailyNotifications();
  const lista = despesas.filter(d => d.mes === monthFilter.value);
  
  // Apply Search filter for the list view
  const searchInput = document.getElementById('search-expense');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const listToRender = searchTerm 
    ? lista.filter(d => (d.nome || '').toLowerCase().includes(searchTerm))
    : lista;
  
  // -- Metrics --
  const formatCurrency = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const totalGeral = lista.reduce((acc, curr) => acc + curr.valor, 0);
  const totalPago = lista.filter(d => d.pago).reduce((acc, curr) => acc + curr.valor, 0);
  const totalAberto = lista.filter(d => !d.pago).reduce((acc, curr) => acc + curr.valor, 0);
  
  // Global atrasado
  const totalAtrasado = despesas.filter(d => isAtrasado(d)).reduce((acc, curr) => acc + curr.valor, 0);

  const totalFixas = lista.filter(d => d.tipo === 'Fixa' || d.tipo === 'Fixo').reduce((acc, curr) => acc + curr.valor, 0);
  const totalVariaveis = lista.filter(d => d.tipo === 'Variável').reduce((acc, curr) => acc + curr.valor, 0);
  const totalParcelado = lista.filter(d => d.tipo === 'Parcelado').reduce((acc, curr) => acc + curr.valor, 0);

  // Gasto Médio Mensal baseado no histórico acumulado
  const distinctMonths = new Set(despesas.map(d => d.mes).filter(Boolean));
  const totalHistorico = despesas.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
  const mediaMensal = distinctMonths.size > 0 ? (totalHistorico / distinctMonths.size) : 0;

  if (totalDisplay) totalDisplay.innerText = formatCurrency(totalGeral);
  if (totalPagoDisplay) totalPagoDisplay.innerText = formatCurrency(totalPago);
  if (totalAbertoDisplay) totalAbertoDisplay.innerText = formatCurrency(totalAberto);
  if (totalAtrasadoDisplay) totalAtrasadoDisplay.innerText = formatCurrency(totalAtrasado);
  
  if (totalFixasDisplay) totalFixasDisplay.innerText = formatCurrency(totalFixas);
  if (totalVariaveisDisplay) totalVariaveisDisplay.innerText = formatCurrency(totalVariaveis);
  if (totalParceladoDisplay) totalParceladoDisplay.innerText = formatCurrency(totalParcelado);
  if (mediaMensalDisplay) mediaMensalDisplay.innerText = formatCurrency(mediaMensal);

  // Rendas e Saldo
  const currentMonth = monthFilter.value;
  const currentRenda = rendasDict[currentMonth] || { renda1: 0, renda2: 0 };
  
  const renda1Input = document.getElementById('renda-1');
  const renda2Input = document.getElementById('renda-2');
  const saldoAtualDisplay = document.getElementById('saldo-atual');

  if (renda1Input && renda2Input) {
    if (renda1Input.dataset.currentMonth !== currentMonth) {
      renda1Input.value = currentRenda.renda1 > 0 ? currentRenda.renda1 : '';
      renda2Input.value = currentRenda.renda2 > 0 ? currentRenda.renda2 : '';
      renda1Input.dataset.currentMonth = currentMonth;
    } else if (document.activeElement !== renda1Input && document.activeElement !== renda2Input) {
      const dbRenda1 = currentRenda.renda1 > 0 ? currentRenda.renda1 : '';
      const dbRenda2 = currentRenda.renda2 > 0 ? currentRenda.renda2 : '';
      if (renda1Input.value !== String(dbRenda1)) renda1Input.value = dbRenda1;
      if (renda2Input.value !== String(dbRenda2)) renda2Input.value = dbRenda2;
    }
  }

  if (saldoAtualDisplay) {
    const valRenda1 = Number(renda1Input ? renda1Input.value : 0) || 0;
    const valRenda2 = Number(renda2Input ? renda2Input.value : 0) || 0;
    const totalRenda = valRenda1 + valRenda2;
    const saldo = totalRenda - totalGeral;
    saldoAtualDisplay.innerText = formatCurrency(saldo);
    saldoAtualDisplay.className = `text-2xl font-bold mt-1 ${saldo < 0 ? 'text-red-400' : 'text-green-400'}`;
  }

  // Category Totals
  const categoryContainer = document.getElementById('category-totals-container');
  if (categoryContainer) {
    categoryContainer.innerHTML = '';
    const catTotals = {};
    lista.forEach(d => {
      const cat = d.categoria || 'Outros';
      catTotals[cat] = (catTotals[cat] || 0) + d.valor;
    });

    const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);

    sortedCats.forEach(cat => {
      const color = mergedCategories[cat] || '#94a3b8';
      const item = document.createElement('div');
      item.className = 'flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 px-4 py-3 rounded-lg flex-1 min-w-[200px]';

      const dot = document.createElement('div');
      dot.className = 'w-3 h-3 rounded-full flex-shrink-0 shadow-sm';
      dot.style.backgroundColor = color;

      const meta = document.createElement('div');
      meta.className = 'flex-1';

      const catLabel = document.createElement('p');
      catLabel.className = 'text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider';
      catLabel.textContent = cat;

      const catTotal = document.createElement('p');
      catTotal.className = 'text-base font-bold text-slate-900 dark:text-white';
      catTotal.textContent = formatCurrency(catTotals[cat]);

      meta.append(catLabel, catTotal);
      item.append(dot, meta);
      categoryContainer.appendChild(item);
    });

    if (sortedCats.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'text-sm text-slate-500 dark:text-slate-400 py-2 w-full text-center';
      emptyState.textContent = 'Nenhuma despesa neste mês.';
      categoryContainer.appendChild(emptyState);
    }
  }

  renderList(listToRender);
  renderGrafico(lista); // Keep chart showing full month data
}

function renderList(lista) {
  const tbody = document.getElementById('expenses-list');
  if (!tbody) return;
  tbody.innerHTML = '';

  const formatCurrency = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  [...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(d => {
    const atrasada = isAtrasado(d);
    const tr = document.createElement('tr');
    tr.className = atrasada
      ? 'bg-red-50/60 hover:bg-red-100/60 border-l-4 border-l-red-500 transition-colors'
      : 'hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-700/50';

    const dataVencObj = (d.dataVencimento || '').split('-');
    const dataStr = dataVencObj.length === 3 ? `${dataVencObj[2]}/${dataVencObj[1]}/${dataVencObj[0]}` : (d.dataVencimento || 'Sem data');

    const checkboxCell = document.createElement('td');
    checkboxCell.className = 'px-6 py-4 text-center';
    const rowCheckbox = document.createElement('input');
    rowCheckbox.type = 'checkbox';
    rowCheckbox.className = 'row-checkbox w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500 cursor-pointer';
    rowCheckbox.dataset.id = d.id;
    checkboxCell.appendChild(rowCheckbox);
    tr.appendChild(checkboxCell);

    const statusCell = document.createElement('td');
    statusCell.className = 'px-6 py-4';
    const statusBadge = document.createElement('span');
    statusBadge.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border';
    if (d.pago) {
      statusBadge.className += ' bg-green-100 text-green-700 border-green-200';
      const statusIcon = document.createElement('span');
      statusIcon.textContent = '✓';
      statusBadge.appendChild(statusIcon);
      statusBadge.appendChild(document.createTextNode('Pago'));
    } else if (atrasada) {
      statusBadge.className += ' gap-1.5 bg-red-100 text-red-700 border-red-200 shadow-sm font-bold';
      const statusIcon = document.createElement('span');
      statusIcon.textContent = '!';
      statusBadge.appendChild(statusIcon);
      statusBadge.appendChild(document.createTextNode('Atrasado'));
    } else {
      statusBadge.className += ' bg-orange-100 text-orange-700 border-orange-200';
      const statusIcon = document.createElement('span');
      statusIcon.textContent = '◔';
      statusBadge.appendChild(statusIcon);
      statusBadge.appendChild(document.createTextNode('Em aberto'));
    }
    statusCell.appendChild(statusBadge);
    tr.appendChild(statusCell);

    const descriptionCell = document.createElement('td');
    descriptionCell.className = 'px-6 py-4';
    if (atrasada) {
      const descWrap = document.createElement('div');
      descWrap.className = 'flex items-center gap-2';

      const descText = document.createElement('span');
      descText.className = 'font-semibold text-red-950';
      descText.textContent = d.nome;
      descWrap.appendChild(descText);

      const warningIcon = document.createElement('span');
      warningIcon.className = 'inline-flex items-center text-red-600';
      warningIcon.title = 'Despesa em atraso!';
      warningIcon.textContent = '!';
      descWrap.appendChild(warningIcon);
      descriptionCell.appendChild(descWrap);
    } else {
      const descText = document.createElement('span');
      descText.className = 'font-medium text-slate-900 dark:text-white';
      descText.textContent = d.nome;
      descriptionCell.appendChild(descText);
    }
    tr.appendChild(descriptionCell);

    const vencCell = document.createElement('td');
    vencCell.className = 'px-6 py-4';
    if (atrasada) {
      const vencWrap = document.createElement('span');
      vencWrap.className = 'inline-flex items-center gap-1.5 text-red-700 font-semibold';
      vencWrap.textContent = dataStr;

      const dueBadge = document.createElement('span');
      dueBadge.className = 'text-[10px] uppercase font-bold bg-red-200/80 text-red-800 px-1.5 py-0.5 rounded';
      dueBadge.textContent = 'Vencida';
      vencWrap.appendChild(dueBadge);
      vencCell.appendChild(vencWrap);
    } else {
      const vencText = document.createElement('span');
      vencText.className = 'text-slate-500 dark:text-slate-400';
      vencText.textContent = dataStr;
      vencCell.appendChild(vencText);
    }
    tr.appendChild(vencCell);

    const typeCell = document.createElement('td');
    typeCell.className = 'px-6 py-4 text-slate-600';
    typeCell.textContent = d.tipo;
    tr.appendChild(typeCell);

    const categoryCell = document.createElement('td');
    categoryCell.className = 'px-6 py-4';
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold text-white shadow-xs';
    categoryBadge.style.backgroundColor = mergedCategories[d.categoria] || '#94a3b8';
    categoryBadge.textContent = d.categoria;
    categoryCell.appendChild(categoryBadge);
    tr.appendChild(categoryCell);

    const valueCell = document.createElement('td');
    valueCell.className = `px-6 py-4 text-right font-bold ${atrasada ? 'text-red-700' : 'text-slate-900 dark:text-white'}`;
    valueCell.textContent = formatCurrency(d.valor);
    tr.appendChild(valueCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'px-6 py-4 text-center';

    const actionWrap = document.createElement('div');
    actionWrap.className = 'flex items-center justify-center gap-3';

    const label = document.createElement('label');
    label.className = 'flex items-center gap-1.5 cursor-pointer';
    label.title = 'Marcar como pago';

    const paidCheckbox = document.createElement('input');
    paidCheckbox.type = 'checkbox';
    paidCheckbox.className = 'toggle-pago-btn w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500';
    paidCheckbox.dataset.id = d.id;
    paidCheckbox.checked = !!d.pago;

    const paidText = document.createElement('span');
    paidText.className = 'text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400';
    paidText.textContent = 'Pago';

    label.append(paidCheckbox, paidText);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'edit-btn text-primary-600 hover:text-primary-800 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors';
    editButton.dataset.id = d.id;
    editButton.textContent = 'Editar';

    actionWrap.append(label, editButton);
    actionsCell.appendChild(actionWrap);
    tr.appendChild(actionsCell);

    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      const d = despesas.find(x => x.id === id);
      if (d) abrirModal(d);
    };
  });

  document.querySelectorAll('.toggle-pago-btn').forEach(checkbox => {
    checkbox.onchange = async (e) => {
      const id = checkbox.getAttribute('data-id');
      const d = despesas.find(x => x.id === id);
      if (d) {
        // Optimistically update UI
        d.pago = e.target.checked;
        await atualizarDespesa(d);
      }
    };
  });

  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  const rowCheckboxes = document.querySelectorAll('.row-checkbox');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');

  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.onchange = (e) => {
      const isChecked = e.target.checked;
      rowCheckboxes.forEach(cb => cb.checked = isChecked);
      updateDeleteBtnVisibility();
    };
  }

  rowCheckboxes.forEach(cb => {
    cb.onchange = () => {
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = Array.from(rowCheckboxes).every(c => c.checked);
      }
      updateDeleteBtnVisibility();
    };
  });

  function updateDeleteBtnVisibility() {
    if (!deleteSelectedBtn) return;
    const hasChecked = Array.from(document.querySelectorAll('.row-checkbox')).some(cb => cb.checked);
    if (hasChecked) {
      deleteSelectedBtn.classList.remove('hidden');
    } else {
      deleteSelectedBtn.classList.add('hidden');
    }
  }
  updateDeleteBtnVisibility();
  
  if (deleteSelectedBtn) {
    deleteSelectedBtn.onclick = async () => {
      const checkedIds = Array.from(document.querySelectorAll('.row-checkbox'))
        .filter(cb => cb.checked)
        .map(cb => cb.getAttribute('data-id'));
        
      if (checkedIds.length === 0) return;
      
      const selectedExpenses = despesas.filter(d => checkedIds.includes(d.id));
      const hasRecurrences = selectedExpenses.some(d => d.groupId);

      showConfirm(`Tem certeza que deseja excluir ${checkedIds.length} despesa(s) selecionada(s)?`, async (deleteAll) => {
        try {
          let idsToDelete = [...checkedIds];
          
          if (deleteAll) {
            const groupIdsToClean = selectedExpenses.map(d => d.groupId).filter(Boolean);
            const relatedExpenses = despesas.filter(d => groupIdsToClean.includes(d.groupId));
            const extraIds = relatedExpenses.map(d => d.id);
            // merge and distinct
            idsToDelete = [...new Set([...idsToDelete, ...extraIds])];
          }

          const { error } = await supabase.from('despesas')
            .delete()
            .eq('family_id', currentFamilyId)
            .in('id', idsToDelete);
          if (error) throw error;
        } catch (error) {
          console.error('Erro ao excluir em lote:', error);
          showAlert(databaseErrorMessage(error));
        }
      }, hasRecurrences);
    };
  }
}


function renderGrafico(lista) {
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#334155' : '#e2e8f0';

  if (chart) chart.destroy();
  if (lista.length === 0 && chartType !== 'line') return;

  const containerId = 'chart';

  if (chartType === 'line') {
    const ultimosMeses = [];
    const [currentYear, currentMonth] = monthFilter.value.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      ultimosMeses.push(`${d.getFullYear()}-${m}`);
    }
    const dataTotals = ultimosMeses.map(mes => {
      const gastosDoMes = despesas.filter(d => d.mes === mes);
      return gastosDoMes.reduce((acc, d) => acc + d.valor, 0);
    });
    const mesFormatado = ultimosMeses.map(mesStr => {
      const [y, m] = mesStr.split('-');
      return `${m}/${y.substring(2)}`;
    });

    chart = Highcharts.chart(containerId, {
      chart: { type: 'area', backgroundColor: 'transparent' },
      title: { text: null },
      xAxis: { 
        categories: mesFormatado,
        labels: { style: { color: textColor } },
        lineColor: gridColor
      },
      yAxis: { 
        title: { text: null },
        labels: { style: { color: textColor } },
        gridLineColor: gridColor
      },
      legend: { enabled: false },
      credits: { enabled: false },
      plotOptions: {
        area: {
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(99, 102, 241, 0.5)'],
              [1, 'rgba(99, 102, 241, 0.05)']
            ]
          },
          marker: { radius: 4 },
          lineWidth: 2,
          color: '#6366f1',
          states: { hover: { lineWidth: 3 } },
          threshold: null
        }
      },
      series: [{
        name: 'Evolução de Gastos',
        data: dataTotals
      }],
      tooltip: {
        valuePrefix: 'R$ ',
        valueDecimals: 2
      }
    });

  } else if (chartType === 'bar') {
    const dataFormatted = lista.map(d => ({
      name: d.nome,
      y: d.valor,
      color: mergedCategories[d.categoria] || '#94a3b8',
      despesaRef: d
    }));

    chart = Highcharts.chart(containerId, {
      chart: { type: 'column', backgroundColor: 'transparent' },
      title: { text: null },
      xAxis: { 
        categories: lista.map(d => d.nome),
        labels: { style: { color: textColor } },
        lineColor: gridColor
      },
      yAxis: { 
        title: { text: null },
        labels: { style: { color: textColor } },
        gridLineColor: gridColor
      },
      legend: { enabled: false },
      credits: { enabled: false },
      plotOptions: {
        column: {
          borderRadius: 4,
          point: {
            events: {
              click: function () {
                abrirModal(this.options.despesaRef);
              }
            }
          }
        }
      },
      series: [{
        name: 'Valor',
        data: dataFormatted
      }],
      tooltip: {
        valuePrefix: 'R$ ',
        valueDecimals: 2
      }
    });

  } else {
    // PIE (3D)
    const soma = {};
    lista.forEach(d => soma[d.categoria] = (soma[d.categoria] || 0) + d.valor);
    const dataFormatted = Object.keys(soma).map(cat => ({
      name: cat,
      y: soma[cat],
      color: mergedCategories[cat] || '#94a3b8'
    }));

    chart = Highcharts.chart(containerId, {
      chart: { 
        type: 'pie', 
        backgroundColor: 'transparent',
        options3d: {
          enabled: true,
          alpha: 45,
          beta: 0
        }
      },
      title: { text: null },
      credits: { enabled: false },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          depth: 35,
          dataLabels: {
            enabled: true,
            format: '{point.name}',
            style: { color: textColor, textOutline: 'none' }
          }
        }
      },
      series: [{
        name: 'Gasto',
        data: dataFormatted
      }],
      tooltip: {
        valuePrefix: 'R$ ',
        valueDecimals: 2
      }
    });
  }
}

/* ---------- MODAL ---------- */
const editModal = document.getElementById('edit-modal');
const editNome = document.getElementById('edit-nome');
const editValor = document.getElementById('edit-valor');
const editTipo = document.getElementById('edit-tipo');
const editVencimento = document.getElementById('edit-vencimento');
const editPago = document.getElementById('edit-pago');
const editCategoria = document.getElementById('edit-categoria');
const editParcelas = document.getElementById('edit-parcelas');
const labelEditParcelas = document.getElementById('label-edit-parcelas');

editTipo.onchange = () => {
  if (editTipo.value === 'Parcelado') {
    labelEditParcelas.innerText = 'Qtd. Parcelas';
    editParcelas.placeholder = 'Ex: 12';
  } else {
    labelEditParcelas.innerText = 'Repetir (Meses)';
    editParcelas.placeholder = '1 (Somente este mês)';
  }
};

function abrirModal(d) {
  despesaSelecionada = d;
  editNome.value = d.nome;
  editValor.value = d.valor;
  editTipo.value = d.tipo || 'Fixa';
  editVencimento.value = d.dataVencimento || '';
  editPago.checked = !!d.pago;
  editCategoria.value = d.categoria;
  editParcelas.value = ''; // Reset
  editTipo.dispatchEvent(new Event('change')); // Trigger label update
  editModal.classList.remove('hidden');
}

document.getElementById('save-edit').onclick = async () => {
  if (!editNome.value || !editValor.value || !editVencimento.value) return showAlert('Preencha descrição, valor e vencimento');

  // Atualiza a despesa atual
  despesaSelecionada.nome = editNome.value;
  despesaSelecionada.valor = Number(editValor.value);
  despesaSelecionada.tipo = editTipo.value;
  despesaSelecionada.dataVencimento = editVencimento.value;
  despesaSelecionada.pago = editPago.checked;
  despesaSelecionada.mes = editVencimento.value ? editVencimento.value.substring(0, 7) : despesaSelecionada.mes;
  despesaSelecionada.categoria = editCategoria.value;
  
  await atualizarDespesa(despesaSelecionada);

  // Se houver repetição / parcelas
  const numRepeticoes = Number(editParcelas.value) || 1;
  const isParcelado = editTipo.value === 'Parcelado';

  // O registro selecionado conta como a parcela/mês 1.
  // Então adicionamos novos registros para os meses subsequentes, caso > 1
  if (numRepeticoes > 1) {
    // Se for parcelado, atualiza o nome da parcela 1 também
    if (isParcelado) {
      despesaSelecionada.nome = `${editNome.value} (1/${numRepeticoes})`;
      await atualizarDespesa(despesaSelecionada);
    }

    for (let i = 1; i < numRepeticoes; i++) {
      const [year, month, day] = editVencimento.value.split('-').map(Number);
      const d = new Date(year, month - 1 + i, day);
      
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      
      const vencStr = `${y}-${m}-${dd}`;
      const mesStr = `${y}-${m}`;
      
      const nomeFinal = isParcelado ? `${editNome.value} (${i + 1}/${numRepeticoes})` : editNome.value;

      const novaDespesa = {
        nome: nomeFinal,
        valor: Number(editValor.value),
        tipo: editTipo.value,
        dataVencimento: vencStr,
        mes: mesStr,
        pago: false, // Novos meses geralmente iniciam em aberto
        categoria: editCategoria.value
      };

      await salvar(novaDespesa); // salvar() creates a new document
    }
  }

  fecharModal();
};

document.getElementById('delete-edit').onclick = async () => {
  const hasRecurrences = despesaSelecionada && despesaSelecionada.groupId;
  showConfirm('Excluir esta despesa?', async (deleteAll) => {
    await excluirDespesa(despesaSelecionada, deleteAll);
    fecharModal();
  }, hasRecurrences);
};

document.getElementById('cancel-edit').onclick = fecharModal;

function fecharModal() {
  despesaSelecionada = null;
  editModal.classList.add('hidden');
}

editModal.onclick = e => {
  if (e.target === editModal) fecharModal();
};

/* ---------- UI ---------- */
toggleChartBtn.onclick = () => {
  if (chartType === 'bar') chartType = 'pie';
  else if (chartType === 'pie') chartType = 'line';
  else chartType = 'bar';
  renderUI();
};

monthFilter.onchange = renderUI;

const searchInput = document.getElementById('search-expense');
if (searchInput) {
  searchInput.oninput = renderUI;
}

// Handle Rendas Input changes
async function saveRendas() {
  if (!currentFamilyId || !currentUser) return;
  const mes = monthFilter.value;
  const renda1 = Number(document.getElementById('renda-1').value) || 0;
  const renda2 = Number(document.getElementById('renda-2').value) || 0;
  
  try {
    const { error } = await supabase.from('rendas').upsert({
      mes,
      renda1,
      renda2,
      family_id: currentFamilyId,
      user_id: currentUser.id
    }, { onConflict: 'family_id,mes' });
    if (error) throw error;
  } catch (error) {
    console.error('Erro ao salvar rendas: ', error);
    showAlert(databaseErrorMessage(error));
  }
}

const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(null, args);
    }, delay);
  };
};

const debouncedSaveRendas = debounce(saveRendas, 1000);

document.getElementById('renda-1').oninput = () => {
  renderUI(); // Atualiza o saldo instantaneamente
  debouncedSaveRendas();
};
document.getElementById('renda-2').oninput = () => {
  renderUI(); // Atualiza o saldo instantaneamente
  debouncedSaveRendas();
};

document.getElementById('renda-1').onchange = saveRendas; // Salva instantaneamente ao sair do campo
document.getElementById('renda-2').onchange = saveRendas;

document.getElementById('prev-month-btn').onclick = () => {
  const [year, month] = monthFilter.value.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  monthFilter.value = `${y}-${m}`;
  renderUI();
};

document.getElementById('next-month-btn').onclick = () => {
  const [year, month] = monthFilter.value.split('-').map(Number);
  const d = new Date(year, month, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  monthFilter.value = `${y}-${m}`;
  renderUI();
};

/* ---------- DICAS E NOTIFICAÇÕES ---------- */
const DICAS_FINANCEIRAS = [
  "Registre todos os seus gastos, até mesmo aquele cafezinho. O controle total ajuda a não perder dinheiro.",
  "Regra 50/30/20: 50% para gastos essenciais, 30% para desejos e 20% para poupar ou investir.",
  "Evite parcelar compras pequenas. O acúmulo de parcelas compromete a sua renda nos próximos meses.",
  "Crie uma reserva de emergência equivalente a 6 meses do seu custo de vida para imprevistos.",
  "Sempre pague a fatura do cartão de crédito na totalidade. Os juros rotativos são os maiores inimigos do seu bolso.",
  "Revise suas assinaturas e serviços mensais. Cancele aquilo que você não tem usado com frequência.",
  "Compare preços antes de comprar. Uma pesquisa rápida na internet pode gerar uma boa economia."
];

function showDicaDoDia() {
  const container = document.getElementById('dica-dia-container');
  const txt = document.getElementById('dica-dia');
  if (container && txt) {
    // Pick random tip based on the day of the year so it changes daily
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const day = Math.floor(diff / oneDay);
    
    const index = day % DICAS_FINANCEIRAS.length;
    txt.innerText = DICAS_FINANCEIRAS[index];
    container.classList.remove('hidden');
  }
}

const notifToggle = document.getElementById('enable-notifications');
if (notifToggle) {
  notifToggle.checked = localStorage.getItem('notif_enabled') === 'true';
  notifToggle.onchange = (e) => {
    const isEnabled = e.target.checked;
    localStorage.setItem('notif_enabled', isEnabled);
    if (isEnabled && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  };
}

function checkDailyNotifications() {
  if (localStorage.getItem('notif_enabled') !== 'true') return;
  if (Notification.permission !== 'granted') return;

  const today = new Date().toLocaleDateString('pt-BR');
  const lastNotified = localStorage.getItem('last_notified_date');
  if (lastNotified === today) return; // already notified today

  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  
  const vencendoHoje = despesas.filter(d => !d.pago && d.dataVencimento === hojeStr);
  
  if (vencendoHoje.length > 0) {
    const count = vencendoHoje.length;
    new Notification('Controle Financeiro', {
      body: `Você tem ${count} conta(s) vencendo hoje!`,
      icon: '/icon.png' // Optional icon
    });
    localStorage.setItem('last_notified_date', today);
  }
}

/* ---------- INIT ---------- */
// carregar() is now called when auth state changes to logged in
monthFilter.value = mesAtual();
showDicaDoDia();
renderUI();

function render() {
  renderUI();
}

/* ---------- CONFIGURAÇÕES DE TEMA ---------- */
// Settings modal open/close handling is in global code block above
const themeBtns = document.querySelectorAll('[data-theme-btn]');

const currentTheme = localStorage.getItem('app-theme') || 'indigo';
setTheme(currentTheme);

if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add('hidden');
    }
  });
}

themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.getAttribute('data-theme-btn');
    setTheme(theme);
  });
});

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);
  
  // Atualizar interface dos botões
  themeBtns.forEach(btn => {
    if (btn.getAttribute('data-theme-btn') === theme) {
      btn.classList.add('ring-slate-400');
      btn.classList.remove('ring-transparent');
    } else {
      btn.classList.remove('ring-slate-400');
      btn.classList.add('ring-transparent');
    }
  });
}

// --- DARK MODE LOGIC ---
const themeToggleBtn = document.getElementById('theme-toggle');
const darkIcon = document.getElementById('theme-toggle-dark-icon');
const lightIcon = document.getElementById('theme-toggle-light-icon');

function updateThemeIcons() {
  if (document.documentElement.classList.contains('dark')) {
    darkIcon.classList.remove('hidden');
    lightIcon.classList.add('hidden');
  } else {
    lightIcon.classList.remove('hidden');
    darkIcon.classList.add('hidden');
  }
}

// Initial theme check
if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}
if(themeToggleBtn) {
  updateThemeIcons();

  themeToggleBtn.addEventListener('click', function() {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('color-theme', 'dark');
    }
    updateThemeIcons();
    // Re-render chart to update colors
    renderUI(); 
  });
}
