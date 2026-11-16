/**
 * UI rendering for the Octane Estimator app.
 * Uses ctx.ui.text, ctx.ui.image (canvas) and ctx.ui.onClick.
 */

class OctaneUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.history = []; // { t, correction } for optional graph
    this.maxHistory = 120; // last 2 minutes at 1 Hz

    // Bind UI elements (names must match app.json widget ids)
    this.ctx.ui.text('octaneValue', '---');
    this.ctx.ui.text('statusLabel', 'Инициализация...');
    this.ctx.ui.text('avgCorrection', '');
    this.ctx.ui.text('sampleCount', '');

    // Reset button
    this.ctx.ui.onClick('resetButton', () => {
      if (this.onReset) this.onReset();
    });

    // Controller grab for reset (optional)
    if (this.ctx.controller) {
      this.ctx.controller.grab(true);
    }
  }

  /**
   * Update the main display.
   * @param {object} est - result from FuelOctaneEstimator.estimate()
   */
  update(est) {
    if (est.status === 'warming_up') {
      this.ctx.ui.text('octaneValue', '---');
      this.ctx.ui.text('statusLabel', 'Прогрев двигателя...');
    } else if (est.status === 'collecting') {
      this.ctx.ui.text('octaneValue', '...');
      this.ctx.ui.text('statusLabel', `Сбор данных (${est.sampleCount})`);
    } else if (est.status === 'stable') {
      this.ctx.ui.text('octaneValue', `≈${est.octane}`);
      this.ctx.ui.text('statusLabel', 'Оценка стабильна');
      if (est.avgCorrection != null) {
        this.ctx.ui.text('avgCorrection', `Коррекция УОЗ: ${est.avgCorrection.toFixed(2)}°`);
      }
      this.ctx.ui.text('sampleCount', `Выборка: ${est.sampleCount}`);
    }
  }

  /**
   * Add a correction sample to the history and redraw the sparkline (optional).
   */
  addHistoryPoint(timestamp, correction) {
    this.history.push({ t: timestamp, correction });
    if (this.history.length > this.maxHistory) this.history.shift();
    this.drawSparkline();
  }

  drawSparkline() {
    // Simple canvas sparkline. Requires ctx.canvas and a widget named 'sparkline'.
    if (!this.ctx.canvas || !this.history.length) return;

    const canvas = this.ctx.canvas('sparkline');
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const g = canvas.getContext('2d');

    g.clearRect(0, 0, w, h);

    const maxAbs = Math.max(4, ...this.history.map(p => Math.abs(p.correction)));
    const midY = h / 2;

    g.beginPath();
    g.strokeStyle = '#4caf50';
    g.lineWidth = 1.5;

    this.history.forEach((p, i) => {
      const x = (i / (this.maxHistory - 1)) * w;
      const y = midY - (p.correction / maxAbs) * (h / 2 - 4);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();

    // Zero line
    g.beginPath();
    g.strokeStyle = '#888';
    g.setLineDash([2, 2]);
    g.moveTo(0, midY);
    g.lineTo(w, midY);
    g.stroke();
  }
}

module.exports = { OctaneUI };
