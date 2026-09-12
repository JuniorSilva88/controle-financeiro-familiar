import re

with open('script.js', 'r', encoding='utf-8') as f:
    js = f.read()

new_render_grafico = """function renderGrafico(lista) {
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
}"""

# regex replace the old renderGrafico
pattern = r'function renderGrafico\(lista\) \{.*?\}\n\}'
js = re.sub(pattern, new_render_grafico, js, flags=re.DOTALL)

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(js)

