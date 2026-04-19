// Tiny inline SVG sparkline. Renders a polyline of the given values with an
// emphasized endpoint dot. `width` uses a preserveAspectRatio="none" viewBox
// so the line stretches to the card width.
window.sparkline = function sparkline(values, opts) {
  opts = opts || {};
  const width = opts.width || 200;
  const height = opts.height || 52;
  const stroke = opts.stroke || 'var(--burlywood)';
  const padY = 5;

  if (!values || values.length < 2) {
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="' + height + '" aria-hidden="true" class="sparkline"></svg>';
  }

  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const range = max - min || 1;
  const usableH = height - 2 * padY;
  const step = width / (values.length - 1);

  const points = values.map(function (v, i) {
    const x = i * step;
    const y = padY + (1 - (v - min) / range) * usableH;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  const lastIdx = values.length - 1;
  const lastX = lastIdx * step;
  const lastY = padY + (1 - (values[lastIdx] - min) / range) * usableH;

  return (
    '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="' + height + '" ' +
    'preserveAspectRatio="none" aria-hidden="true" class="sparkline">' +
    '<polyline points="' + points + '" fill="none" stroke="' + stroke + '" ' +
    'stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" ' +
    'vector-effect="non-scaling-stroke" />' +
    '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="2.6" fill="' + stroke + '" />' +
    '</svg>'
  );
};
