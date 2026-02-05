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
  parcelas.value = '';
  parcelado.value = 'nao';
  parcelas.disabled = true;
}

/* ---------- GRÁFICO ---------- */
const monthFilter = document.getElementById('month-filter');
const toggleChartBtn = document.getElementById('toggle-chart');

function renderGrafico() {
  const ctx = document.getElementById('chart');
  if (chart) chart.destroy();

  const lista = despesas.filter(d => d.mes === monthFilter.value);
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
const editParcelas = document.getElementById('edit-parcelas');
const editCategoria = document.getElementById('edit-categoria');

function abrirModal(d) {
  despesaSelecionada = d;
  editNome.value = d.nome;
  editValor.value = d.valor;
  editParcelas.value = d.parcelas;
  editCategoria.value = d.categoria;
  editModal.classList.remove('hidden');
}

document.getElementById('save-edit').onclick = () => {
  despesaSelecionada.nome = editNome.value;
  despesaSelecionada.valor = Number(editValor.value);
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
