import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, query, where, updateDoc, deleteDoc, doc, Timestamp, onSnapshot, getDoc, setDoc } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

let currentUser = null;
let currentFamilyId = null;

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
  if (currentUser) {
    await signOut(auth);
  } else {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const profileContainer = document.getElementById('user-profile-container');
  const profileImg = document.getElementById('user-profile-img');
  
  if (user) {
    authBtn.innerHTML = `<span>Sair</span>`;
    authBtn.classList.replace('bg-primary-600', 'bg-slate-600');
    authBtn.classList.replace('hover:bg-primary-700', 'hover:bg-slate-700');
    
    // Setup Profile Image
    if (profileContainer && profileImg) {
      profileContainer.classList.remove('hidden');
      profileContainer.classList.add('flex');
      if (user.photoURL) {
        profileImg.src = user.photoURL;
      } else {
        const name = user.displayName || user.email || 'U';
        profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;
      }
      profileImg.title = user.displayName || user.email || 'Perfil';
    }

    
    // Check Invite
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    const userDocRef = doc(db, 'users', user.uid);
    
    try {
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        currentFamilyId = userDoc.data().familyId || user.uid;
        if (inviteId && inviteId !== currentFamilyId) {
          showConfirm('Você recebeu um convite para participar de um novo grupo familiar. Deseja entrar? (Sua visualização atual será substituída)', async () => {
            currentFamilyId = inviteId;
            await updateDoc(userDocRef, { familyId: currentFamilyId });
            window.history.replaceState({}, document.title, window.location.pathname);
            carregar();
          });
        }
      } else {
        currentFamilyId = inviteId || user.uid;
        await setDoc(userDocRef, {
          familyId: currentFamilyId,
          email: user.email,
          createdAt: Timestamp.now()
        });
        if (inviteId) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    } catch(e) {
      console.error(e);
      currentFamilyId = user.uid;
    }
    
    // Configure invite UI
    const inviteInput = document.getElementById('invite-link');
    const copyBtn = document.getElementById('copy-invite');
    if (inviteInput && copyBtn) {
      const inviteUrl = new URL(window.location.href);
      inviteUrl.searchParams.set('invite', currentFamilyId);
      inviteInput.value = inviteUrl.toString();
      copyBtn.classList.remove('hidden');
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(inviteInput.value);
        const originalText = copyBtn.innerText;
        copyBtn.innerText = 'Copiado!';
        setTimeout(() => copyBtn.innerText = originalText, 2000);
      };
    }

    // Migrate old records to have familyId (one-time fallback check for owner)
    if (currentFamilyId === user.uid) {
      migrateOldRecords(user.uid);
    }

    carregar();
  } else {
    authBtn.innerHTML = `<span>Login</span>`;
    authBtn.classList.replace('bg-slate-600', 'bg-primary-600');
    authBtn.classList.replace('hover:bg-slate-700', 'hover:bg-primary-700');
    despesas = [];
    currentFamilyId = null;
    const inviteInput = document.getElementById('invite-link');
    const copyBtn = document.getElementById('copy-invite');
    if (inviteInput) inviteInput.value = '';
    if (copyBtn) copyBtn.classList.add('hidden');

    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
    if (unsubscribeCategories) {
      unsubscribeCategories();
      unsubscribeCategories = null;
    }
    userCategories = {};
    mergedCategories = { ...DEFAULT_CATEGORIAS };
    renderCategorias();
    renderUI();
    
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.classList.add('hidden'), 300);
    }
  }
});

async function migrateOldRecords(uid) {
  try {
    const qDespesas = query(collection(db, 'despesas'), where('userId', '==', uid));
    const snap = await getDocs(qDespesas);
    snap.forEach(d => {
      if (!d.data().familyId) updateDoc(doc(db, 'despesas', d.id), { familyId: uid });
    });
    
    const qCats = query(collection(db, 'categorias'), where('userId', '==', uid));
    const snapCats = await getDocs(qCats);
    snapCats.forEach(c => {
      if (!c.data().familyId) updateDoc(doc(db, 'categorias', c.id), { familyId: uid });
    });
  } catch(e) {
    console.error("Migração falhou:", e);
  }
}

/* ---------- STORAGE (Firebase) ---------- */
async function salvar(novaDespesa) {
  if (!currentUser) return showAlert('Faça login para salvar');
  
  try {
    await addDoc(collection(db, 'despesas'), {
      ...novaDespesa,
      userId: currentUser.uid,
      familyId: currentFamilyId,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Erro ao adicionar documento: ', error);
  }
}

async function atualizarDespesa(d) {
  if (!currentUser || !d.id) return;
  
  try {
    const despesaRef = doc(db, 'despesas', d.id);
    await updateDoc(despesaRef, {
      nome: d.nome,
      valor: d.valor,
      tipo: d.tipo,
      dataVencimento: d.dataVencimento,
      pago: d.pago,
      mes: d.mes,
      categoria: d.categoria
    });
  } catch (error) {
    console.error('Erro ao atualizar documento: ', error);
  }
}

async function excluirDespesa(d, deleteAllRecurrences = false) {
  if (!currentUser || !d.id) return;
  
  try {
    if (deleteAllRecurrences && d.groupId) {
      // Find all expenses with the same groupId
      const related = despesas.filter(item => item.groupId === d.groupId);
      const deletePromises = related.map(item => deleteDoc(doc(db, 'despesas', item.id)));
      await Promise.all(deletePromises);
    } else {
      await deleteDoc(doc(db, 'despesas', d.id));
    }
  } catch (error) {
    console.error('Erro ao excluir documento(s): ', error);
  }
}

function carregar() {
  if (!currentUser) return;
  
  // Load expenses
  const qDespesas = query(collection(db, 'despesas'), where('familyId', '==', currentFamilyId));
  
  unsubscribeSnapshot = onSnapshot(qDespesas, (snapshot) => {
    despesas = [];
    snapshot.forEach((doc) => {
      despesas.push({ id: doc.id, ...doc.data() });
    });
    renderUI();
    
    const loader = document.getElementById('initial-loader');
    if (loader && !loader.classList.contains('hidden')) {
      loader.style.opacity = '0';
      setTimeout(() => loader.classList.add('hidden'), 300);
    }
  }, (error) => {
    console.error('Erro ao buscar dados: ', error);
  });

  // Load custom categories
  const qCats = query(collection(db, 'categorias'), where('familyId', '==', currentFamilyId));
  unsubscribeCategories = onSnapshot(qCats, (snapshot) => {
    userCategories = {};
    snapshot.forEach((doc) => {
      const data = doc.data();
      userCategories[data.nome] = { id: doc.id, cor: data.cor };
    });
    
    // Merge
    mergedCategories = { ...DEFAULT_CATEGORIAS };
    for (const [name, catData] of Object.entries(userCategories)) {
      mergedCategories[name] = catData.cor;
    }
    
    renderCategorias();
    if (chart) renderUI(); // Re-render to update colors if needed
  }, (error) => {
    console.error('Erro ao buscar categorias: ', error);
  });

  // Load rendas
  const qRendas = query(collection(db, 'rendas'), where('familyId', '==', currentFamilyId));
  unsubscribeRendas = onSnapshot(qRendas, (snapshot) => {
    rendasDict = {};
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.mes) {
        rendasDict[data.mes] = { id: docSnap.id, renda1: data.renda1 || 0, renda2: data.renda2 || 0 };
      }
    });
    renderUI();
  }, (error) => {
    console.error('Erro ao buscar rendas: ', error);
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
      selectAdd.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
      selectEdit.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
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
      
      let deleteBtnHtml = '';
      if (isCustom) {
        deleteBtnHtml = `
          <button onclick="excluirCategoria('${userCategories[cat].id}', '${cat}')" class="text-slate-400 hover:text-red-500 p-1 rounded transition-colors" title="Excluir categoria">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        `;
      } else {
        deleteBtnHtml = `<span class="text-[10px] text-slate-400 font-medium uppercase px-2">Padrão</span>`;
      }

      catList.insertAdjacentHTML('beforeend', `
        <li class="flex justify-between items-center px-4 py-2 hover:bg-white transition-colors group">
          <div class="flex items-center gap-3">
            <span class="w-4 h-4 rounded-full" style="background-color: ${color}"></span>
            <span class="text-sm font-medium text-slate-700">${cat}</span>
          </div>
          ${deleteBtnHtml}
        </li>
      `);
    });
  }
}

// Global functions for inline onclick
window.excluirCategoria = async (docId, catName) => {
  showConfirm(`Excluir a categoria "${catName}"?`, async () => {
    try {
      await deleteDoc(doc(db, 'categorias', docId));
    } catch(e) {
      console.error("Erro ao excluir categoria:", e);
    }
  });
};

/* ---------- SETTINGS MODAL ---------- */
const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings').onclick = () => settingsModal.classList.remove('hidden');
document.getElementById('close-settings').onclick = () => settingsModal.classList.add('hidden');

document.getElementById('add-category-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!currentUser) return;

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
    await addDoc(collection(db, 'categorias'), {
      nome: name,
      cor: color,
      userId: currentUser.uid,
      familyId: currentFamilyId,
      createdAt: Timestamp.now()
    });
    nameInput.value = '';
    // Color input keeps its value
  } catch (error) {
    console.error('Erro ao adicionar categoria:', error);
    showAlert('Erro ao criar categoria.');
  }
};

function showAlert(msg) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4';
  const box = document.createElement('div');
  box.className = 'bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center';
  box.innerHTML = `
    <p class="text-slate-800 dark:text-slate-200 font-medium mb-6">${msg}</p>
    <button class="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg w-full transition-colors">OK</button>
  `;
  box.querySelector('button').onclick = () => overlay.remove();
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function showConfirm(msg, onConfirm, withRecurrence = false) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4';
  const box = document.createElement('div');
  box.className = 'bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center';
  
  let extraHtml = '';
  if (withRecurrence) {
    extraHtml = `
      <label class="flex items-center gap-2 mt-4 mb-6 cursor-pointer text-left bg-red-50 p-3 rounded-lg border border-red-100">
        <input type="checkbox" id="delete-recurrences" class="w-4 h-4 text-red-600 rounded border-red-300 focus:ring-red-500">
        <span class="text-sm text-red-800">Excluir também todas as outras parcelas/repetições desta(s) despesa(s)</span>
      </label>
    `;
  }

  box.innerHTML = `
    <p class="text-slate-800 dark:text-slate-200 font-medium ${withRecurrence ? 'mb-2' : 'mb-6'}">${msg}</p>
    ${extraHtml}
    <div class="flex gap-3 justify-center">
      <button id="custom-confirm-cancel" class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg transition-colors">Cancelar</button>
      <button id="custom-confirm-ok" class="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors">Confirmar</button>
    </div>
  `;
  box.querySelector('#custom-confirm-cancel').onclick = () => overlay.remove();
  box.querySelector('#custom-confirm-ok').onclick = () => {
    const isChecked = withRecurrence ? box.querySelector('#delete-recurrences').checked : false;
    overlay.remove();
    onConfirm(isChecked);
  };
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
    
    // Sort by amount descending
    const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
    
    sortedCats.forEach(cat => {
      const color = mergedCategories[cat] || '#94a3b8';
      categoryContainer.insertAdjacentHTML('beforeend', `
        <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 px-4 py-3 rounded-lg flex-1 min-w-[200px]">
          <div class="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style="background-color: ${color}"></div>
          <div class="flex-1">
            <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">${cat}</p>
            <p class="text-base font-bold text-slate-900 dark:text-white">${formatCurrency(catTotals[cat])}</p>
          </div>
        </div>
      `);
    });
    
    if (sortedCats.length === 0) {
      categoryContainer.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 py-2 w-full text-center">Nenhuma despesa neste mês.</p>';
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
    let statusHTML = '';
    
    if (d.pago) {
      statusHTML = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200"><svg class="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Pago</span>`;
    } else if (atrasada) {
      statusHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-sm"><svg class="w-3.5 h-3.5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>Atrasado</span>`;
    } else {
      statusHTML = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200"><svg class="w-3.5 h-3.5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>Em aberto</span>`;
    }

    const tr = document.createElement('tr');
    tr.className = atrasada
      ? 'bg-red-50/60 hover:bg-red-100/60 border-l-4 border-l-red-500 transition-colors'
      : 'hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-700/50';
    
    // Split YYYY-MM-DD back to DD/MM/YYYY
    const dataVencObj = (d.dataVencimento || '').split('-');
    const dataStr = dataVencObj.length === 3 ? `${dataVencObj[2]}/${dataVencObj[1]}/${dataVencObj[0]}` : (d.dataVencimento || 'Sem data');

    const descHTML = atrasada
      ? `<div class="flex items-center gap-2">
          <span class="font-semibold text-red-950">${d.nome}</span>
          <span class="inline-flex items-center text-red-600" title="Despesa em atraso!">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </span>
        </div>`
      : `<span class="font-medium text-slate-900 dark:text-white">${d.nome}</span>`;

    const vencHTML = atrasada
      ? `<span class="inline-flex items-center gap-1.5 text-red-700 font-semibold">${dataStr} <span class="text-[10px] uppercase font-bold bg-red-200/80 text-red-800 px-1.5 py-0.5 rounded">Vencida</span></span>`
      : `<span class="text-slate-500 dark:text-slate-400">${dataStr}</span>`;

    tr.innerHTML = `
      <td class="px-6 py-4 text-center">
        <input type="checkbox" class="row-checkbox w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500 cursor-pointer" data-id="${d.id}">
      </td>
      <td class="px-6 py-4">${statusHTML}</td>
      <td class="px-6 py-4">${descHTML}</td>
      <td class="px-6 py-4">${vencHTML}</td>
      <td class="px-6 py-4 text-slate-600">${d.tipo}</td>
      <td class="px-6 py-4">
        <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold text-white shadow-xs" style="background-color: ${mergedCategories[d.categoria] || '#94a3b8'}">
          ${d.categoria}
        </span>
      </td>
      <td class="px-6 py-4 text-right font-bold ${atrasada ? 'text-red-700' : 'text-slate-900 dark:text-white'}">${formatCurrency(d.valor)}</td>
      <td class="px-6 py-4 text-center">
        <div class="flex items-center justify-center gap-3">
          <label class="flex items-center gap-1.5 cursor-pointer" title="Marcar como pago">
            <input type="checkbox" class="toggle-pago-btn w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500" data-id="${d.id}" ${d.pago ? 'checked' : ''}>
            <span class="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Pago</span>
          </label>
          <button class="edit-btn text-primary-600 hover:text-primary-800 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors" data-id="${d.id}">Editar</button>
        </div>
      </td>
    `;
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

          const deletePromises = idsToDelete.map(id => deleteDoc(doc(db, 'despesas', id)));
          await Promise.all(deletePromises);
        } catch (error) {
          console.error('Erro ao excluir em lote:', error);
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
  
  const docId = `${currentFamilyId}_${mes}`;
  
  try {
    await setDoc(doc(db, 'rendas', docId), {
      mes,
      renda1,
      renda2,
      familyId: currentFamilyId,
      userId: currentUser.uid
    }, { merge: true });
  } catch (error) {
    console.error('Erro ao salvar rendas: ', error);
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
