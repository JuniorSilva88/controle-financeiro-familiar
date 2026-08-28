const STORAGE_KEY = 'despesas_dashboard_ok';

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

/* ---------- STORAGE ---------- */
function salvar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(despesas));
}

function carregar() {
  const d = localStorage.getItem(STORAGE_KEY);
  despesas = d ? JSON.parse(d) : [];
}

/* ---------- HELPERS ---------- */
function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

/* ---------- FORM ---------- */
const nome = document.getElementById('nome');
const valor = document.getElementById('valor');
const tipo = document.getElementById('tipo');
const parcelado = document.getElementById('parcelado');
const parcelas = document.getElementById('parcelas');
const mes = document.getElementById('mes');
const categoria = document.getElementById('categoria');

parcelado.onchange = () => {
  parcelas.disabled = parcelado.value !== 'sim';
};

/* ---------- ADD ---------- */
document.getElementById('add-btn').onclick = () => {
  if (!nome.value || !valor.value) return alert('Preencha descrição e valor');

  despesas.push({
    nome: nome.value,
    valor: Number(valor.value),
    tipo: tipo.value,
    parcelado: parcelado.value === 'sim',
    parcelas: Number(parcelas.value) || 1,
    mes: mes.value,
    categoria: categoria.value,
    confirmada: true
  });

  salvar();
  limparFormulario();
  render();
};

function limparFormulario() {
  nome.value = '';
  valor.value = '';
  tipo.value = 'Fixa';
  parcelas.value = '';
  parcelado.value = 'nao';
  parcelas.disabled = true;
}

/* ---------- GRÁFICO ---------- */
const monthFilter = document.getElementById('month-filter');
const toggleChartBtn = document.getElementById('toggle-chart');
const totalDisplay = document.getElementById('total-display');
const totalFixasDisplay = document.getElementById('total-fixas');
const totalVariaveisDisplay = document.getElementById('total-variaveis');

function renderGrafico() {
  const ctx = document.getElementById('chart');
  if (chart) chart.destroy();

  const lista = despesas.filter(d => d.mes === monthFilter.value);
  
  // Update total display
  const totalFixas = lista.filter(d => d.tipo === 'Fixa').reduce((acc, curr) => acc + curr.valor, 0);
  const totalVariaveis = lista.filter(d => d.tipo === 'Variável').reduce((acc, curr) => acc + curr.valor, 0);
  const total = totalFixas + totalVariaveis;

  const formatCurrency = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (totalDisplay) totalDisplay.innerText = formatCurrency(total);
  if (totalFixasDisplay) totalFixasDisplay.innerText = formatCurrency(totalFixas);
  if (totalVariaveisDisplay) totalVariaveisDisplay.innerText = formatCurrency(totalVariaveis);

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
const editParcelas = document.getElementById('edit-parcelas');
const editCategoria = document.getElementById('edit-categoria');

function abrirModal(d) {
  despesaSelecionada = d;
  editNome.value = d.nome;
  editValor.value = d.valor;
  editTipo.value = d.tipo || 'Fixa';
  editParcelas.value = d.parcelas;
  editCategoria.value = d.categoria;
  editModal.classList.remove('hidden');
}

document.getElementById('save-edit').onclick = () => {
  despesaSelecionada.nome = editNome.value;
  despesaSelecionada.valor = Number(editValor.value);
  despesaSelecionada.tipo = editTipo.value;
  despesaSelecionada.parcelas = Number(editParcelas.value);
  despesaSelecionada.categoria = editCategoria.value;
  salvar();
  fecharModal();
  render();
};

document.getElementById('delete-edit').onclick = () => {
  if (!confirm('Excluir esta despesa?')) return;
  despesas = despesas.filter(d => d !== despesaSelecionada);
  salvar();
  fecharModal();
  render();
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
  renderGrafico();
};

monthFilter.onchange = renderGrafico;

/* ---------- INIT ---------- */
carregar();
monthFilter.value = mesAtual();
mes.value = mesAtual();
renderGrafico();

function render() {
  renderGrafico();
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
