var BodyCompForecast = (function () {
  'use strict';

  var LS_KEY = 'hs_body_measurements';
  var DAYS   = 84; // 12 weeks

  // ── US Navy BF% formula ───────────────────────────────────────
  function navyBF(m) {
    if (!m.height || !m.waist || !m.neck) return null;
    if (m.gender === 'f' && !m.hip)       return null;
    var h = m.height, w = m.waist, n = m.neck, hi = m.hip;
    if (m.gender === 'f') {
      return 163.205 * Math.log10(w + hi - n) - 97.684 * Math.log10(h) - 78.387;
    }
    var diff = w - n;
    if (diff <= 0) return null;
    return 86.010 * Math.log10(diff) - 70.041 * Math.log10(h) + 36.76;
  }

  // ── Linear regression (slope kg/day) ─────────────────────────
  function linReg(entries) {
    if (entries.length < 2) return 0;
    var n = entries.length;
    var t0 = new Date(entries[0].date).getTime();
    var xs = entries.map(function (e) {
      return (new Date(e.date).getTime() - t0) / 86400000;
    });
    var ys = entries.map(function (e) { return e.weight; });
    var mx = xs.reduce(function (a, b) { return a + b; }, 0) / n;
    var my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
    var num = 0, den = 0;
    for (var i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) * (xs[i] - mx);
    }
    return den === 0 ? 0 : num / den;
  }

  // ── Forecast one band ─────────────────────────────────────────
  // Returns array of {day, bf} for DAYS days
  function forecast(currentWeight, currentBF, slopeKgDay) {
    var fatMass  = currentWeight * currentBF / 100;
    var leanMass = currentWeight - fatMass;
    var pts = [];
    for (var d = 0; d <= DAYS; d++) {
      var projWeight = currentWeight + slopeKgDay * d;
      if (projWeight < leanMass + 1) projWeight = leanMass + 1; // floor
      var projFat  = fatMass + slopeKgDay * d;
      if (projFat < 2) projFat = 2; // floor 2%
      var projBF   = (projFat / projWeight) * 100;
      pts.push({ day: d, bf: Math.max(2, Math.min(50, projBF)) });
    }
    return pts;
  }

  // target date for a given BF% goal in a band
  function targetDate(band, goalBF) {
    for (var i = 0; i < band.length; i++) {
      if (band[i].bf <= goalBF) {
        var d = new Date();
        d.setDate(d.getDate() + band[i].day);
        return d;
      }
    }
    return null;
  }

  // ── SVG chart ─────────────────────────────────────────────────
  function buildChart(bands, currentBF) {
    var W = 500, H = 180;
    var PAD = { top: 16, right: 24, bottom: 32, left: 38 };
    var cw = W - PAD.left - PAD.right;
    var ch = H - PAD.top - PAD.bottom;

    // y range: min(all bands last pt) - 1 to currentBF + 1
    var allVals = bands.current.map(function (p) { return p.bf; })
      .concat(bands.aggressive.map(function (p) { return p.bf; }))
      .concat(bands.sustainable.map(function (p) { return p.bf; }));
    var yMin = Math.floor(Math.min.apply(null, allVals)) - 1;
    var yMax = Math.ceil(currentBF) + 1;
    if (yMin < 2)  yMin = 2;
    if (yMax > 50) yMax = 50;
    var yRange = yMax - yMin || 1;

    function sx(day) { return PAD.left + (day / DAYS) * cw; }
    function sy(bf)  { return PAD.top + (1 - (bf - yMin) / yRange) * ch; }

    function toPath(pts) {
      return pts.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + sx(p.day).toFixed(1) + ',' + sy(p.bf).toFixed(1);
      }).join(' ');
    }

    // x-axis tick labels (weeks)
    var xTicks = [0, 14, 28, 42, 56, 70, 84];
    var xTickSvg = xTicks.map(function (d) {
      return '<text x="' + sx(d).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" '
        + 'fill="rgba(255,255,255,0.35)" font-size="10">'
        + (d === 0 ? 'Hoy' : 'S' + (d / 7)) + '</text>';
    }).join('');

    // y-axis ticks
    var yTicks = [];
    for (var y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
      if ((y - Math.ceil(yMin)) % 2 === 0) yTicks.push(y);
    }
    var yTickSvg = yTicks.map(function (y) {
      return '<text x="' + (PAD.left - 5) + '" y="' + (sy(y) + 3).toFixed(1) + '" text-anchor="end" '
        + 'fill="rgba(255,255,255,0.35)" font-size="10">' + y + '%</text>'
        + '<line x1="' + PAD.left + '" y1="' + sy(y).toFixed(1)
        + '" x2="' + (PAD.left + cw) + '" y2="' + sy(y).toFixed(1)
        + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
    }).join('');

    // current BF reference line
    var refY = sy(currentBF).toFixed(1);
    var refLine = '<line x1="' + PAD.left + '" y1="' + refY + '" x2="' + (PAD.left + cw) + '" y2="' + refY
      + '" stroke="rgba(255,255,255,0.18)" stroke-width="1" stroke-dasharray="4 3"/>'
      + '<text x="' + (PAD.left + cw + 2) + '" y="' + (parseFloat(refY) + 3) + '" fill="rgba(255,255,255,0.4)" font-size="9">Actual</text>';

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" '
      + 'style="width:100%;height:auto;display:block;">'
      + yTickSvg + refLine
      // aggressive band (red)
      + '<path d="' + toPath(bands.aggressive) + '" fill="none" stroke="#f87171" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.7"/>'
      // sustainable band (green)
      + '<path d="' + toPath(bands.sustainable) + '" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.7"/>'
      // current pace (cyan, solid)
      + '<path d="' + toPath(bands.current) + '" fill="none" stroke="#22d3ee" stroke-width="2"/>'
      // today dot
      + '<circle cx="' + sx(0).toFixed(1) + '" cy="' + sy(currentBF).toFixed(1) + '" r="4" fill="#22d3ee"/>'
      + xTickSvg
      + '</svg>';
  }

  // ── Render ────────────────────────────────────────────────────
  function render(root) {
    var m = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    var weightEntries = JSON.parse(localStorage.getItem('hs_weight_entries') || '[]');
    weightEntries.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    var last28 = weightEntries.filter(function (e) {
      return Date.now() - new Date(e.date).getTime() <= 28 * 86400000;
    });

    // ── If no measurements yet, show setup form ───────────────
    if (!m || !m.height) {
      root.innerHTML = '<div class="bcf-setup">'
        + '<p class="bcf-setup-lead">Introduce tus medidas para activar la proyección de composición corporal.</p>'
        + renderForm(null)
        + '</div>';
      wireForm(root, m, weightEntries, last28);
      return;
    }

    var bf = navyBF(m);
    if (bf === null || bf < 2 || bf > 50) {
      root.innerHTML = '<div class="bcf-setup"><p class="bcf-setup-lead">Las medidas introducidas no producen un % grasa válido. Revísalas.</p>'
        + renderForm(m) + '</div>';
      wireForm(root, m, weightEntries, last28);
      return;
    }

    bf = Math.round(bf * 10) / 10;

    var currentWeight = last28.length
      ? last28[last28.length - 1].weight
      : (m.weight || 70);

    var slope = last28.length >= 3 ? linReg(last28) : 0;

    // 1 kg fat ≈ 7700 kcal → 500 kcal deficit extra ≈ 0.065 kg/day
    var bandAggressive  = forecast(currentWeight, bf, slope - 0.065);
    var bandCurrent     = forecast(currentWeight, bf, slope);
    var bandSustainable = forecast(currentWeight, bf, slope + 0.032);

    // target date at current pace for goal (round 2% below current)
    var goalBF  = Math.max(5, Math.round(bf) - 2);
    var tDate   = targetDate(bandCurrent, goalBF);
    var tDateStr = tDate
      ? tDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      : 'más de 12 semanas';

    // calories needed to hit aggressive band at 84 days
    var aggFinalBF  = bandAggressive[DAYS].bf;
    var curFinalBF  = bandCurrent[DAYS].bf;

    root.innerHTML = ''
      + '<div class="bcf-headline">'
      + '<span class="bcf-bf-val">' + bf.toFixed(1) + '<span class="bcf-bf-unit">% BF</span></span>'
      + '<span class="bcf-target-line">A este ritmo llegas al ' + goalBF + '% el <strong>' + tDateStr + '</strong></span>'
      + '</div>'
      + '<div class="bcf-chart-wrap">' + buildChart({ aggressive: bandAggressive, current: bandCurrent, sustainable: bandSustainable }, bf) + '</div>'
      + '<div class="bcf-legend">'
      + '<span class="bcf-leg bcf-leg--current"><span class="bcf-leg-dot"></span>Ritmo actual → ' + curFinalBF.toFixed(1) + '% en 12s</span>'
      + '<span class="bcf-leg bcf-leg--agg"><span class="bcf-leg-dot"></span>Agresivo (−500 kcal) → ' + aggFinalBF.toFixed(1) + '% en 12s</span>'
      + '<span class="bcf-leg bcf-leg--sus"><span class="bcf-leg-dot"></span>Sostenible</span>'
      + '</div>'
      + '<details class="bcf-details"><summary>Editar medidas</summary>'
      + renderForm(m)
      + '</details>';

    wireForm(root, m, weightEntries, last28);
  }

  function renderForm(m) {
    var v = m || {};
    return '<form class="bcf-form" id="bcf-form">'
      + '<div class="bcf-form-row">'
      + '<label class="bcf-label">Sexo</label>'
      + '<div class="bcf-radio-group">'
      + '<label><input type="radio" name="bcf-gender" value="m"' + (v.gender !== 'f' ? ' checked' : '') + '> Hombre</label>'
      + '<label><input type="radio" name="bcf-gender" value="f"' + (v.gender === 'f' ? ' checked' : '') + '> Mujer</label>'
      + '</div></div>'
      + '<div class="bcf-form-grid">'
      + field('Altura (cm)', 'bcf-height', v.height, 'number', '150', '220')
      + field('Cuello (cm)', 'bcf-neck', v.neck, 'number', '25', '60')
      + field('Cintura (cm)', 'bcf-waist', v.waist, 'number', '50', '150')
      + '<div class="bcf-field bcf-field--hip"' + (v.gender !== 'f' ? ' style="display:none"' : '') + '>'
      + '<label class="bcf-field-label">Cadera (cm)</label>'
      + '<input class="bcf-input" id="bcf-hip" type="number" min="60" max="160" value="' + (v.hip || '') + '">'
      + '</div>'
      + '</div>'
      + '<button type="submit" class="btn btn--primary bcf-submit">Calcular proyección</button>'
      + '</form>';
  }

  function field(label, id, val, type, min, max) {
    return '<div class="bcf-field">'
      + '<label class="bcf-field-label" for="' + id + '">' + label + '</label>'
      + '<input class="bcf-input" id="' + id + '" type="' + type + '" min="' + min + '" max="' + max + '" value="' + (val || '') + '">'
      + '</div>';
  }

  function wireForm(root, prevM, weightEntries, last28) {
    var form = root.querySelector('#bcf-form');
    if (!form) return;

    // Toggle hip field based on gender
    var genderInputs = form.querySelectorAll('input[name="bcf-gender"]');
    var hipField = form.querySelector('.bcf-field--hip');
    genderInputs.forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (hipField) hipField.style.display = inp.value === 'f' ? '' : 'none';
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var gender = form.querySelector('input[name="bcf-gender"]:checked');
      var m = {
        gender:  gender ? gender.value : 'm',
        height:  parseFloat(form.querySelector('#bcf-height').value) || 0,
        neck:    parseFloat(form.querySelector('#bcf-neck').value)   || 0,
        waist:   parseFloat(form.querySelector('#bcf-waist').value)  || 0,
        hip:     parseFloat(form.querySelector('#bcf-hip') ? form.querySelector('#bcf-hip').value : 0) || 0,
        updatedAt: new Date().toISOString(),
      };
      if (!m.height || !m.neck || !m.waist) {
        alert('Introduce altura, cuello y cintura como mínimo.');
        return;
      }
      localStorage.setItem(LS_KEY, JSON.stringify(m));
      render(root);
    });
  }

  // ── Public API ────────────────────────────────────────────────
  function init() {
    var root = document.getElementById('bcf-root');
    if (!root) return;
    render(root);
  }

  return { init: init };
})();
