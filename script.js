// Referências aos botões e container da lista
const addBtn = document.getElementById('add-btn');
const removeBtn = document.getElementById('remove-btn');
const listContainer = document.getElementById('expense-list');

let despesas = []; // Array para armazenar despesas

// Cria uma linha de despesa com labels e inputs
function criarLinha(despesa, index) {
  const row = document.createElement('div');
  row.className = 'row';

  // Checkbox para selecionar despesa para remoção
  const divCheck = document.createElement('div');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'delete-check';
  check.dataset.index = index;
  divCheck.appendChild(check);
  row.appendChild(divCheck);

  // Função auxiliar para criar input com label
  function criarCampo(labelText, type, value, options) {
    const div = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = (type === 'select') ? document.createElement('select') : document.createElement('input');

    if (type === 'select') {
      options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        if (opt.value === value) option.selected = true;
        input.appendChild(option);
      });
    } else {
      input.type = type;
      input.value = value;
    }

    div.appendChild(label);
    div.appendChild(input);
    return { div, input };
  }

  // Campos da despesa
  const nomeCampo = criarCampo('Nome', 'text', despesa.nome);
  const valorCampo = criarCampo('Valor Original', 'number', despesa.valor);
  const negociadoCampo = criarCampo('Valor Negociado', 'number', despesa.negociado);
  const dataCampo = criarCampo('Data', 'date', despesa.data);
  const parceladaCampo = criarCampo('Parcelada', 'select', despesa.parcelada, [
    { value: 'Não', text: 'Não' },
    { value: 'Sim', text: 'Sim' }
  ]);
  const parcelasCampo = criarCampo('Parcelas', 'number', despesa.parcelas);

  // Status da despesa: quitado ou pendente
  const statusSpan = document.createElement('span');
  statusSpan.className = 'status ' + (despesa.negociado >= despesa.valor ? 'quitado' : 'pendente');
  statusSpan.textContent = despesa.negociado >= despesa.valor ? 'Quitado' : 'Pendente';

  // Adiciona campos à linha
  row.appendChild(nomeCampo.div);
  row.appendChild(valorCampo.div);
  row.appendChild(negociadoCampo.div);
  row.appendChild(dataCampo.div);
  row.appendChild(parceladaCampo.div);
  row.appendChild(parcelasCampo.div);
  row.appendChild(statusSpan);

  // Atualiza os dados quando algum campo mudar
  [nomeCampo.input, valorCampo.input, negociadoCampo.input, dataCampo.input, parceladaCampo.input, parcelasCampo.input].forEach(input => {
    input.addEventListener('change', () => {
      despesas[index] = {
        nome: nomeCampo.input.value,
        valor: parseFloat(valorCampo.input.value) || 0,
        negociado: parseFloat(negociadoCampo.input.value) || 0,
        data: dataCampo.input.value,
        parcelada: parceladaCampo.input.value,
        parcelas: parseInt(parcelasCampo.input.value) || 0,
      };
      renderizar();
    });
  });

  return row;
}

// Renderiza todas as despesas na tela
function renderizar() {
  listContainer.innerHTML = '';
  despesas.forEach((desp, idx) => {
    listContainer.appendChild(criarLinha(desp, idx));
  });
  atualizarResumo();
  atualizarGraficos();
}

// Atualiza os totais e status no resumo
function atualizarResumo() {
  const totalOriginal = despesas.reduce((acc, d) => acc + d.valor, 0);
  const totalNegociado = despesas.reduce((acc, d) => acc + d.negociado, 0);
  const quitadas = despesas.filter(d => d.negociado >= d.valor).length;

  document.getElementById('total-original').textContent = `Total Original: R$ ${totalOriginal.toFixed(2)}`;
  document.getElementById('total-negociado').textContent = `Total Negociado: R$ ${totalNegociado.toFixed(2)}`;
  document.getElementById('total-quitadas').textContent = `Despesas Quitadas: ${quitadas} de ${despesas.length}`;
}

let barChart, pieChart;

// Atualiza os gráficos com Chart.js
function atualizarGraficos() {
  const ctxBar = document.getElementById('barChart').getContext('2d');
  const ctxPie = document.getElementById('pieChart').getContext('2d');

  const labels = despesas.map(d => d.nome || '(sem nome)');
  const valores = despesas.map(d => d.valor);
  const negociados = despesas.map(d => d.negociado);

  const quitadas = despesas.filter(d => d.negociado >= d.valor).length;
  const pendentes = despesas.length - quitadas;

  if (barChart) barChart.destroy();
  barChart = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Valor', data: valores, backgroundColor: '#6366f1' },
        { label: 'Negociado', data: negociados, backgroundColor: '#10b981' }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { autoSkip: false } },
        y: { beginAtZero: true }
      }
    }
  });

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctxPie, {
    type: 'pie',
    data: {
      labels: ['Quitadas', 'Pendentes'],
      datasets: [{ data: [quitadas, pendentes], backgroundColor: ['#10b981', '#ef4444'] }]
    },
    options: { responsive: true }
  });
}

// Adiciona nova despesa vazia ao clicar em "Adicionar Despesa"
addBtn.addEventListener('click', () => {
  despesas.push({
    nome: '',
    valor: 0,
    negociado: 0,
    data: '',
    parcelada: 'Não',
    parcelas: 0
  });
  renderizar();
});

// Remove despesas selecionadas ao clicar em "Remover Selecionadas"
removeBtn.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.delete-check:checked');
  const indices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
  despesas = despesas.filter((_, idx) => !indices.includes(idx));
  renderizar();
});

// Inicializa a interface com uma despesa de exemplo
despesas = [
  { nome: 'Internet', valor: 120, negociado: 120, data: '2025-06-01', parcelada: 'Não', parcelas: 0 }
];

renderizar();
