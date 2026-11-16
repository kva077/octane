/**
 * Heuristic fuel octane estimator.
 *
 * The algorithm collects timing corrections (long + short) and knock retard
 * over a driving window. Negative corrections (retard) indicate that the ECU
 * is pulling timing, which suggests lower-octane fuel. Positive corrections
 * (advance) suggest higher-octane fuel or a tolerant engine.
 *
 * Warm-up gating: no estimate is produced until coolant temperature exceeds
 * MIN_WARM_TEMP_C.
 *
 * Transient filtering: samples are ignored when RPM is outside
 * [RPM_MIN, RPM_MAX] or when load (mass air flow) changes too quickly.
 *
 * The final octane number is a linear mapping of the average correction:
 *   octane = OCTANE_MIN + (avgCorrection - CORRECTION_MIN) * SCALE
 * clamped to [OCTANE_MIN, OCTANE_MAX].
 *
 * All constants are configurable via CONFIG.
 */

const CONFIG = {
  // Warm-up
  MIN_WARM_TEMP_C: 70,

  // Operating window
  RPM_MIN: 1200,
  RPM_MAX: 6500,

  // Transient rejection: ignore if |d(load)/dt| > threshold (g/s per sample)
  LOAD_CHANGE_THRESHOLD: 0.15,

  // Minimum samples before a stable estimate is shown
  MIN_SAMPLES: 30,

  // Mapping from average correction (°) to octane
  CORRECTION_MIN: -6,   // strong retard → low octane
  CORRECTION_MAX: +2,   // advance → high octane
  OCTANE_MIN: 80,
  OCTANE_MAX: 100,

  // How many seconds of history to keep (rolling window)
  WINDOW_SECONDS: 300, // 5 minutes
};

class FuelOctaneEstimator {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.samples = [];           // { t, correction }
    this.lastLoad = null;
    this.lastTimestamp = null;
    this.warmingUp = true;
  }

  /**
   * Feed a new sample. Returns true if the sample was accepted.
   * @param {object} data - { coolantTemp, rpm, massAirFlow, ignitionTiming, timingCorrectionLong, timingCorrectionShort, knockRetard }
   * @param {number} timestamp - ms
   */
  addSample(data, timestamp) {
    const c = this.config;

    // Warm-up gate
    if (data.coolantTemp == null || data.coolantTemp < c.MIN_WARM_TEMP_C) {
      this.warmingUp = true;
      return false;
    }
    this.warmingUp = false;

    // RPM gate
    if (data.rpm == null || data.rpm < c.RPM_MIN || data.rpm > c.RPM_MAX) {
      return false;
    }

    // Load (mass air flow) transient rejection
    if (data.massAirFlow == null) return false;
    if (this.lastLoad != null && this.lastTimestamp != null) {
      const dt = (timestamp - this.lastTimestamp) / 1000; // seconds
      if (dt > 0) {
        const dLoad = Math.abs(data.massAirFlow - this.lastLoad) / dt;
        if (dLoad > c.LOAD_CHANGE_THRESHOLD) {
          // Transient, skip
          this.lastLoad = data.massAirFlow;
          this.lastTimestamp = timestamp;
          return false;
        }
      }
    }
    this.lastLoad = data.massAirFlow;
    this.lastTimestamp = timestamp;

    // Compute total correction: long + short - knock retard
    const longCorr = data.timingCorrectionLong || 0;
    const shortCorr = data.timingCorrectionShort || 0;
    const knock = data.knockRetard || 0;
    const totalCorrection = longCorr + shortCorr - knock; // negative = retard

    this.samples.push({ t: timestamp, correction: totalCorrection });

    // Trim window
    const cutoff = timestamp - c.WINDOW_SECONDS * 1000;
    this.samples = this.samples.filter(s => s.t >= cutoff);

    return true;
  }

  /**
   * Compute the current estimate.
   * @returns {object} { octane: number|null, status: string, avgCorrection: number|null, sampleCount: number }
   */
  estimate() {
    const c = this.config;

    if (this.warmingUp) {
      return { octane: null, status: 'warming_up', avgCorrection: null, sampleCount: this.samples.length };
    }

    if (this.samples.length < c.MIN_SAMPLES) {
      return { octane: null, status: 'collecting', avgCorrection: null, sampleCount: this.samples.length };
    }

    const sum = this.samples.reduce((acc, s) => acc + s.correction, 0);
    const avg = sum / this.samples.length;

    // Linear map: avg in [CORRECTION_MIN, CORRECTION_MAX] → [OCTANE_MIN, OCTANE_MAX]
    const t = (avg - c.CORRECTION_MIN) / (c.CORRECTION_MAX - c.CORRECTION_MIN);
    const rawOctane = c.OCTANE_MIN + t * (c.OCTANE_MAX - c.OCTANE_MIN);
    const octane = Math.max(c.OCTANE_MIN, Math.min(c.OCTANE_MAX, rawOctane));

    return {
      octane: Math.round(octane),
      status: 'stable',
      avgCorrection: avg,
      sampleCount: this.samples.length,
    };
  }

  /** Reset all collected statistics (e.g., after refueling). */
  reset() {
    this.samples = [];
    this.lastLoad = null;
    this.lastTimestamp = null;
    this.warmingUp = true;
  }
}

module.exports = { FuelOctaneEstimator, CONFIG };
