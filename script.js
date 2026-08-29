import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, query, where, updateDoc, deleteDoc, doc, Timestamp, onSnapshot } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

let currentUser = null;

const CATEGORIAS = {
  Moradia: '#6366f1',
  Saúde: '#10b981',
  Educação: '#f59e0b',
  Alimentação: '#ef4444',
  Transporte: '#0ea5e9',
  Outros: '#64748b'
};

let despesas = [];
let chart = null;
let chartType = 'bar';
let despesaSelecionada = null;
let unsubscribeSnapshot = null;

/* ---------- TEMP IMPORT ---------- */
const importBtn = document.getElementById('import-btn');
if (importBtn) {
  importBtn.onclick = async () => {
    if (!currentUser) return alert('Faça login primeiro para importar!');
    if (!confirm('Isso vai APAGAR todas as despesas atuais e recriar com base na tabela. Continuar?')) return;
    
    try {
      importBtn.innerHTML = `<span>Limpando banco...</span>`;
      importBtn.disabled = true;

      // 1. Wipe existing data
      const q = query(collection(db, 'despesas'), where('userId', '==', currentUser.uid));
      const snap = await getDocs(q);
      const deletePromises = [];
      snap.forEach(documento => {
        deletePromises.push(deleteDoc(doc(db, 'despesas', documento.id)));
      });
      await Promise.all(deletePromises);

      importBtn.innerHTML = `<span>Recriando...</span>`;

      // 2. Insert seed data
      const seedData = [
        { nome: "c", valor: 95.61, tipo: "Variável", dataVencimento: "2026-08-10", mes: "2026-08", pago: true, categoria: "Outros" },
        { nome: "Luz", valor: 168.75, tipo: "Variável", dataVencimento: "2026-08-12", mes: "2026-08", pago: true, categoria: "Moradia" },
        { nome: "Internet", valor: 122.90, tipo: "Variável", dataVencimento: "2026-08-10", mes: "2026-08", pago: true, categoria: "Moradia" },
        { nome: "Cartão Magalu", valor: 5974.48, tipo: "Variável", dataVencimento: "2025-01-01", mes: "2025-01", pago: false, categoria: "Outros" },
        { nome: "Boleto IPRF", valor: 272.63, tipo: "Parcelado", dataVencimento: "2026-05-29", mes: "2026-05", pago: false, categoria: "Outros" },
        { nome: "KS Móveis", valor: 622.84, tipo: "Variável", dataVencimento: "2026-04-01", mes: "2026-04", pago: true, categoria: "Moradia" },
        { nome: "Faculdade", valor: 128.99, tipo: "Fixo", dataVencimento: "2026-08-08", mes: "2026-08", pago: true, categoria: "Educação" },
        { nome: "Financiamento Carro", valor: 1500.00, tipo: "Variável", dataVencimento: "2026-08-10", mes: "2026-08", pago: true, categoria: "Transporte" },
        { nome: "Financiamento Ap", valor: 1650.00, tipo: "Parcelado", dataVencimento: "2026-06-01", mes: "2026-06", pago: true, categoria: "Moradia" },
        { nome: "Prestes", valor: 1800.00, tipo: "Variável", dataVencimento: "2025-01-01", mes: "2025-01", pago: false, categoria: "Outros" },
        { nome: "Cielo Móveis", valor: 590.00, tipo: "Variável", dataVencimento: "2025-01-01", mes: "2025-01", pago: false, categoria: "Moradia" },
        { nome: "Condomínio", valor: 593.11, tipo: "Fixo", dataVencimento: "2026-06-01", mes: "2026-06", pago: true, categoria: "Moradia" },
        { nome: "Empréstimo 1", valor: 529.00, tipo: "Fixo", dataVencimento: "2026-08-07", mes: "2026-08", pago: true, categoria: "Outros" },
        { nome: "Empréstimo 2", valor: 600.00, tipo: "Variável", dataVencimento: "2026-01-10", mes: "2026-01", pago: false, categoria: "Outros" },
        { nome: "IPTU 2025", valor: 201.87, tipo: "Parcelado", dataVencimento: "2025-01-01", mes: "2025-01", pago: true, categoria: "Moradia" },
        { nome: "IPTU 2026", valor: 179.36, tipo: "Parcelado", dataVencimento: "2026-08-20", mes: "2026-08", pago: true, categoria: "Moradia" },
        { nome: "Assinatura M Livre", valor: 74.90, tipo: "Fixo", dataVencimento: "2026-08-17", mes: "2026-08", pago: true, categoria: "Outros" },
        { nome: "Cartão Nubank", valor: 700.00, tipo: "Variável", dataVencimento: "2026-08-10", mes: "2026-08", pago: true, categoria: "Outros" }
      ];

      for (const item of seedData) {
        await salvar(item);
      }

      importBtn.innerHTML = `<span>Sucesso!</span>`;
      setTimeout(() => {
        importBtn.remove();
      }, 3000);
    } catch (error) {
      console.error(error);
      alert('Erro ao recriar: ' + error.message);
      importBtn.innerHTML = `<span>Erro</span>`;
      importBtn.disabled = false;
    }
  };
}

/* ---------- AUTH ---------- */
const authBtn = document.getElementById('auth-btn');
authBtn.onclick = async () => {
  if (currentUser) {
    await signOut(auth);
  } else {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    authBtn.innerHTML = `<span>Sair</span>`;
    authBtn.classList.replace('bg-primary-600', 'bg-slate-600');
    authBtn.classList.replace('hover:bg-primary-700', 'hover:bg-slate-700');
    carregar();
  } else {
    authBtn.innerHTML = `<span>Login</span>`;
    authBtn.classList.replace('bg-slate-600', 'bg-primary-600');
    authBtn.classList.replace('hover:bg-slate-700', 'hover:bg-primary-700');
    despesas = [];
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
    renderUI();
  }
});

/* ---------- STORAGE (Firebase) ---------- */
async function salvar(novaDespesa) {
  if (!currentUser) return alert('Faça login para salvar');
  
  try {
    await addDoc(collection(db, 'despesas'), {
      ...novaDespesa,
      userId: currentUser.uid,
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

async function excluirDespesa(d) {
  if (!currentUser || !d.id) return;
  
  try {
    await deleteDoc(doc(db, 'despesas', d.id));
  } catch (error) {
    console.error('Erro ao excluir documento: ', error);
  }
}

function carregar() {
  if (!currentUser) return;
  
  const q = query(collection(db, 'despesas'), where('userId', '==', currentUser.uid));
  
  unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
    despesas = [];
    snapshot.forEach((doc) => {
      despesas.push({ id: doc.id, ...doc.data() });
    });
    renderUI();
  }, (error) => {
    console.error('Erro ao buscar dados: ', error);
  });
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

/* ---------- FORM ---------- */
const nome = document.getElementById('nome');
const valor = document.getElementById('valor');
const tipo = document.getElementById('tipo');
const dataVencimento = document.getElementById('dataVencimento');
const parcelas = document.getElementById('parcelas');
const pago = document.getElementById('pago');
const categoria = document.getElementById('categoria');

tipo.onchange = () => {
  parcelas.disabled = tipo.value !== 'Parcelado';
  if (tipo.value !== 'Parcelado') parcelas.value = '';
};

/* ---------- ADD ---------- */
document.getElementById('add-btn').onclick = async () => {
  if (!nome.value || !valor.value || !dataVencimento.value) return alert('Preencha descrição, valor e vencimento');

  const isPago = pago.checked;
  const isParcelado = tipo.value === 'Parcelado';
  const numParcelas = isParcelado ? (Number(parcelas.value) || 1) : 1;

  for (let i = 0; i < numParcelas; i++) {
    // Treat the date in local timezone correctly to avoid off-by-one errors
    const [year, month, day] = dataVencimento.value.split('-').map(Number);
    const d = new Date(year, month - 1 + i, day);
    
    // Formatting back to YYYY-MM-DD
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    
    const vencStr = `${y}-${m}-${dd}`;
    const mesStr = `${y}-${m}`;
    const nomeFinal = numParcelas > 1 ? `${nome.value} (${i + 1}/${numParcelas})` : nome.value;

    const novaDespesa = {
      nome: nomeFinal,
      valor: Number(valor.value),
      tipo: tipo.value,
      dataVencimento: vencStr,
      mes: mesStr,
      pago: isPago,
      categoria: categoria.value
    };

    await salvar(novaDespesa);
  }

  limparFormulario();
};

function limparFormulario() {
  nome.value = '';
  valor.value = '';
  tipo.value = 'Fixa';
  dataVencimento.value = '';
  parcelas.value = '';
  parcelas.disabled = true;
  pago.checked = false;
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

function renderUI() {
  const lista = despesas.filter(d => d.mes === monthFilter.value);
  
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

  if (totalDisplay) totalDisplay.innerText = formatCurrency(totalGeral);
  if (totalPagoDisplay) totalPagoDisplay.innerText = formatCurrency(totalPago);
  if (totalAbertoDisplay) totalAbertoDisplay.innerText = formatCurrency(totalAberto);
  if (totalAtrasadoDisplay) totalAtrasadoDisplay.innerText = formatCurrency(totalAtrasado);
  
  if (totalFixasDisplay) totalFixasDisplay.innerText = formatCurrency(totalFixas);
  if (totalVariaveisDisplay) totalVariaveisDisplay.innerText = formatCurrency(totalVariaveis);
  if (totalParceladoDisplay) totalParceladoDisplay.innerText = formatCurrency(totalParcelado);

  renderList(lista);
  renderGrafico(lista);
}

function renderList(lista) {
  const tbody = document.getElementById('expenses-list');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const formatCurrency = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  [...lista].sort((a, b) => (a.dataVencimento || '').localeCompare(b.dataVencimento || '')).forEach(d => {
    let statusHTML = '';
    if (d.pago) {
      statusHTML = `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Pago</span>`;
    } else if (isAtrasado(d)) {
      statusHTML = `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Atrasado</span>`;
    } else {
      statusHTML = `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Em aberto</span>`;
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors';
    
    // Split YYYY-MM-DD back to DD/MM/YYYY
    const dataVencObj = (d.dataVencimento || '').split('-');
    const dataStr = dataVencObj.length === 3 ? `${dataVencObj[2]}/${dataVencObj[1]}/${dataVencObj[0]}` : (d.dataVencimento || 'Sem data');

    tr.innerHTML = `
      <td class="px-6 py-4">${statusHTML}</td>
      <td class="px-6 py-4 font-medium text-slate-900">${d.nome}</td>
      <td class="px-6 py-4 text-slate-500">${dataStr}</td>
      <td class="px-6 py-4 text-slate-500">${d.tipo}</td>
      <td class="px-6 py-4">
        <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium text-white" style="background-color: ${CATEGORIAS[d.categoria] || '#999'}">
          ${d.categoria}
        </span>
      </td>
      <td class="px-6 py-4 text-right font-medium text-slate-900">${formatCurrency(d.valor)}</td>
      <td class="px-6 py-4 text-center">
        <button class="edit-btn text-primary-600 hover:text-primary-800 font-medium" data-id="${d.id}">Editar</button>
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
}

function renderGrafico(lista) {
  const ctx = document.getElementById('chart');
  if (chart) chart.destroy();

  if (lista.length === 0) return;

  if (chartType === 'bar') {
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: lista.map(d => d.nome),
        datasets: [{
          data: lista.map(d => d.valor),
          backgroundColor: lista.map(d => CATEGORIAS[d.categoria])
        }]
      },
      options: {
        onClick: (_, els) => {
          if (!els.length) return;
          abrirModal(lista[els[0].index]);
        }
      }
    });
  } else {
    const soma = {};
    lista.forEach(d => soma[d.categoria] = (soma[d.categoria] || 0) + d.valor);

    chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: Object.keys(soma),
        datasets: [{
          data: Object.values(soma),
          backgroundColor: Object.keys(soma).map(c => CATEGORIAS[c])
        }]
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

function abrirModal(d) {
  despesaSelecionada = d;
  editNome.value = d.nome;
  editValor.value = d.valor;
  editTipo.value = d.tipo || 'Fixa';
  editVencimento.value = d.dataVencimento || '';
  editPago.checked = !!d.pago;
  editCategoria.value = d.categoria;
  editModal.classList.remove('hidden');
}

document.getElementById('save-edit').onclick = async () => {
  despesaSelecionada.nome = editNome.value;
  despesaSelecionada.valor = Number(editValor.value);
  despesaSelecionada.tipo = editTipo.value;
  despesaSelecionada.dataVencimento = editVencimento.value;
  despesaSelecionada.pago = editPago.checked;
  despesaSelecionada.mes = editVencimento.value ? editVencimento.value.substring(0, 7) : despesaSelecionada.mes;
  despesaSelecionada.categoria = editCategoria.value;
  
  await atualizarDespesa(despesaSelecionada);
  fecharModal();
};

document.getElementById('delete-edit').onclick = async () => {
  if (!confirm('Excluir esta despesa?')) return;
  await excluirDespesa(despesaSelecionada);
  fecharModal();
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
  chartType = chartType === 'bar' ? 'pie' : 'bar';
  renderUI();
};

monthFilter.onchange = renderUI;

/* ---------- INIT ---------- */
// carregar() is now called when auth state changes to logged in
monthFilter.value = mesAtual();
renderUI();

function render() {
  renderUI();
}

/* ---------- CONFIGURAÇÕES DE TEMA ---------- */
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const themeBtns = document.querySelectorAll('[data-theme-btn]');

const currentTheme = localStorage.getItem('app-theme') || 'indigo';
setTheme(currentTheme);

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });
}

if (closeSettings) {
  closeSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
}

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
