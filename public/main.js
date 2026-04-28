// Dashboard renderer. Reads public/data.json and paints 8 KPI cards.

const METRIC_CONFIG = [
  { key: 'qualifiedLeads',    label: 'Qualified Leads',     format: 'number',  goodDirection: 'up',      hasSources: false },
  { key: 'totalVisitors',     label: 'Website Visitors',    format: 'number',  goodDirection: 'up',      hasSources: true,  sourceFormat: 'number' },
  { key: 'conversionRate',    label: 'Conversion Rate',     format: 'percent', goodDirection: 'up',      hasSources: true,  sourceFormat: 'percent' },
  { key: 'googleAdsSpend',    label: 'Google Ads Spend',    format: 'money',   goodDirection: 'neutral', hasSources: false },
  { key: 'metaAdsSpend',      label: 'Meta Ads Spend',      format: 'money',   goodDirection: 'neutral', hasSources: false },
  { key: 'costPerBooking',    label: 'Cost Per Booking',    format: 'money',   goodDirection: 'down',    hasSources: true,  sourceFormat: 'money' },
  { key: 'totalBookingValue', label: 'Total Booking Value', format: 'money',   goodDirection: 'up',      hasSources: true,  sourceFormat: 'money' },
  { key: 'roas',              label: 'ROAS',                format: 'roas',    goodDirection: 'up',      hasSources: false },
];

const SOURCE_LABELS = {
  googleAds: 'Google Ads',
  metaAds:   'Meta Ads',
  organic:   'Organic',
  direct:    'Direct',
  '(direct)': 'Direct',
  '(none)':   'Direct',
  google:     'Google',
  facebook:   'Facebook',
  instagram:  'Instagram',
  bing:       'Bing',
  yahoo:      'Yahoo',
  duckduckgo: 'DuckDuckGo',
  'l.instagram.com': 'Instagram',
  'm.facebook.com':  'Facebook',
  'l.facebook.com':  'Facebook',
};

function humanSource(key) {
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  // Fallback: strip parens, title-case the dotless first segment.
  const cleaned = String(key).replace(/[()]/g, '');
  const head = cleaned.split('.')[0] || cleaned;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

const FORMATTERS = {
  money:   (n) => '$' + Math.round(n).toLocaleString('en-US'),
  number:  (n) => Math.round(n).toLocaleString('en-US'),
  percent: (n) => (n * 100).toFixed(2) + '%',
  roas:    (n) => n.toFixed(2) + 'x',
};

function format(value, kind) {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  return (FORMATTERS[kind] || FORMATTERS.number)(value);
}

function pctDelta(current, prior) {
  if (!prior || !isFinite(prior) || prior === 0) return null;
  return (current - prior) / prior;
}

function deltaClass(delta, goodDirection) {
  if (delta === null || Math.abs(delta) < 0.005) return 'flat';
  if (goodDirection === 'neutral') return 'flat';
  const improving =
    (goodDirection === 'up'   && delta > 0) ||
    (goodDirection === 'down' && delta < 0);
  return improving ? 'good' : 'bad';
}

function deltaArrow(delta) {
  if (delta === null || Math.abs(delta) < 0.005) return '→';
  return delta > 0 ? '↑' : '↓';
}

function formatDelta(delta) {
  if (delta === null) return '—';
  const pct = (delta * 100);
  const sign = pct > 0 ? '+' : '';
  return sign + pct.toFixed(1) + '%';
}

function renderSources(bySource, sourceFormat, bySourceSecondary) {
  if (!bySource) return '';
  const rows = Object.keys(bySource).map((key) => {
    const label = humanSource(key);
    const primary = format(bySource[key], sourceFormat);
    let display = primary;
    if (bySourceSecondary && key in bySourceSecondary) {
      // Card 3 (Conversion Rate): show "count · rate"
      const secondary = format(bySourceSecondary[key], 'number');
      display = secondary + ' · ' + primary;
    }
    return (
      '<div class="source-row">' +
        '<span class="src-label">' + label + '</span>' +
        '<span class="src-value">' + display + '</span>' +
      '</div>'
    );
  });
  return '<div class="sources">' + rows.join('') + '</div>';
}

function renderCard(cfg, metric) {
  if (!metric) {
    return (
      '<div class="card">' +
        '<div class="label">' + cfg.label + '</div>' +
        '<div class="value">—</div>' +
      '</div>'
    );
  }

  const wow = pctDelta(metric.current, metric.prior);
  const yoy = pctDelta(metric.current, metric.priorYear);
  const wowCls = deltaClass(wow, cfg.goodDirection);
  const yoyCls = deltaClass(yoy, cfg.goodDirection);
  const historyValues = (metric.history || []).map((p) => p.value);

  const sourcesHTML = cfg.hasSources ? renderSources(metric.bySource, cfg.sourceFormat, metric.bySourceSecondary) : '';
  const sparklineHTML = window.sparkline(historyValues);

  return (
    '<div class="card">' +
      '<div class="label">' + cfg.label + '</div>' +
      '<div class="value">' + format(metric.current, cfg.format) + '</div>' +
      '<div class="deltas">' +
        '<span class="delta delta-wow ' + wowCls + '">' +
          '<span class="arrow">' + deltaArrow(wow) + '</span> ' +
          formatDelta(wow) + ' vs last week' +
        '</span>' +
        '<span class="delta delta-yoy ' + yoyCls + '">' +
          '<span class="arrow">' + deltaArrow(yoy) + '</span> ' +
          formatDelta(yoy) + ' YoY' +
        '</span>' +
      '</div>' +
      sourcesHTML +
      '<div class="sparkline-wrap">' + sparklineHTML + '</div>' +
    '</div>'
  );
}

function formatWeekRange(startISO, endISO) {
  const start = new Date(startISO + 'T00:00:00');
  const end   = new Date(endISO + 'T00:00:00');
  const fmt = (d, opts) => d.toLocaleDateString('en-US', opts);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return fmt(start, { month: 'long' }) + ' ' + start.getDate() + '–' + end.getDate() + ', ' + end.getFullYear();
  }
  return fmt(start, { month: 'short', day: 'numeric' }) + ' – ' + fmt(end, { month: 'short', day: 'numeric' }) + ', ' + end.getFullYear();
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function getHashWeek() {
  const m = /week=(\d{4}-\d{2}-\d{2})/.exec(window.location.hash);
  return m ? m[1] : null;
}

function setHashWeek(weekOf) {
  history.replaceState(null, '', '#week=' + weekOf);
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  return res.json();
}

function renderGrid(data) {
  document.getElementById('hero-subtitle').textContent =
    'Week of ' + formatWeekRange(data.weekOf.start, data.weekOf.end);
  document.getElementById('footer-updated').textContent =
    'Last updated ' + formatTimestamp(data.generatedAt);
  const grid = document.getElementById('grid');
  grid.innerHTML = METRIC_CONFIG
    .map((cfg) => renderCard(cfg, data.metrics[cfg.key]))
    .join('');
}

function renderWeekPicker(weeks, activeWeek, onChange) {
  const picker = document.getElementById('week-picker');
  // Newest first in the dropdown.
  const options = weeks
    .slice()
    .reverse()
    .map((w) => {
      const label = 'Week of ' + formatWeekRange(w.start, w.end);
      const selected = w.weekOf === activeWeek ? ' selected' : '';
      return '<option value="' + w.weekOf + '"' + selected + '>' + label + '</option>';
    })
    .join('');
  picker.innerHTML =
    '<label class="pick-label">Viewing</label>' +
    '<select class="pick-select" aria-label="Select week">' + options + '</select>';
  picker.hidden = false;
  picker.querySelector('select').addEventListener('change', (e) => {
    onChange(e.target.value);
  });
}

async function loadWeek(weekOf) {
  try {
    const data = await fetchJSON('weeks/' + weekOf + '.json');
    renderGrid(data);
    setHashWeek(weekOf);
  } catch (err) {
    document.getElementById('hero-subtitle').textContent = 'Could not load week ' + weekOf;
    console.error(err);
  }
}

async function init() {
  // Try the multi-week index first; fall back to single data.json for older deploys.
  let index;
  try {
    index = await fetchJSON('weeks/index.json');
  } catch {
    try {
      const data = await fetchJSON('data.json');
      renderGrid(data);
    } catch (err) {
      document.getElementById('hero-subtitle').textContent = 'Could not load data.';
      console.error(err);
    }
    return;
  }

  const requested = getHashWeek();
  const available = index.weeks.map((w) => w.weekOf);
  const activeWeek = requested && available.includes(requested) ? requested : index.latest;

  renderWeekPicker(index.weeks, activeWeek, (weekOf) => loadWeek(weekOf));
  await loadWeek(activeWeek);
}

init();
