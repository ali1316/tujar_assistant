// charts.js — Dynamic chart rendering (Chart.js, ECharts, Tabulator tables)

export const PALETTE = [
  '#d1a65c', // Gold
  '#59c48f', // Green
  '#5f86b3', // Steel blue
  '#e0705f', // Bad / Red
  '#e6b450', // Warning / Amber
  '#e8d3a8', // Sand
  '#38bdf8', // Light blue
  '#a78bfa', // Purple
  '#f472b6', // Pink
];

export const STATUS_COLORS = {
  'قيد التنفيذ': '#5f86b3',
  'مكتمل': '#59c48f',
  'متأخر': '#e0705f',
  'متوقف': '#e6b450',
};

export const PRIORITY_COLORS = {
  'عالية': '#e0705f',
  'متوسطة': '#e6b450',
  'منخفضة': '#59c48f',
};

export function brandFont() {
  return (window.ui?.state?.font || 'IBM Plex Sans Arabic') + ', system-ui, sans-serif';
}

/**
 * Render a dynamic Chart.js on a target canvas or selector.
 */
export function renderChart(canvasOrSelector, config = {}) {
  const canvas = typeof canvasOrSelector === 'string'
    ? document.querySelector(canvasOrSelector)
    : canvasOrSelector;
  if (!canvas) return null;

  if (!window.Chart) {
    console.warn('[charts] Chart.js is not loaded');
    return null;
  }

  // Set default brand font
  window.Chart.defaults.font.family = brandFont();
  window.Chart.defaults.color = '#8ea3bd';

  return new window.Chart(canvas, config);
}

/**
 * Render an ECharts instance on a target container or selector.
 */
export function renderEChart(containerOrSelector, options = {}) {
  const container = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;
  if (!container) return null;

  if (!window.echarts) {
    console.warn('[charts] ECharts is not loaded');
    return null;
  }

  const chart = window.echarts.getInstanceByDom(container) || window.echarts.init(container, 'dark', {
    renderer: 'canvas',
  });

  const defaultThemeOptions = {
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: brandFont(),
      color: '#eef2f7',
    },
    ...options,
  };

  chart.setOption(defaultThemeOptions);

  window.addEventListener('resize', () => {
    try { chart.resize(); } catch {}
  });

  return chart;
}

/**
 * Render a Tabulator table on a target container or selector.
 */
export function renderTabulator(containerOrSelector, config = {}) {
  const container = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;
  if (!container) return null;

  if (!window.Tabulator) {
    console.warn('[charts] Tabulator is not loaded');
    return null;
  }

  const defaultConfig = {
    layout: 'fitColumns',
    responsiveLayout: 'collapse',
    textDirection: 'rtl',
    ...config,
  };

  return new window.Tabulator(container, defaultConfig);
}

/**
 * Chart.js configuration generator helpers
 */
export function createBarChartConfig({ title, labels = [], values = [], unit = '' }) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        backgroundColor: '#d1a65c',
        borderColor: '#0e2238',
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 46,
      }],
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 1400, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: x => `${x.formattedValue} ${unit}`.trim(),
          },
        },
      },
      scales: {
        x: { ticks: { color: '#8ea3bd' }, grid: { color: '#1d3a5a' } },
        y: { ticks: { color: '#8ea3bd' }, grid: { color: '#1d3a5a' } },
      },
    },
  };
}

export function createDoughnutChartConfig({ labels = [], values = [], colors = PALETTE }) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, i) => colors[i % colors.length]),
        borderColor: '#0e2238',
        borderWidth: 3,
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { color: '#eef2f7' } },
      },
      animation: { animateRotate: true, duration: 1400 },
    },
  };
}
