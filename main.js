/**
 * Entry point for the Octane Estimator app on BMW MGU (iDrive 7).
 */

const { watchAll } = require('./src/signals');
const { FuelOctaneEstimator } = require('./src/fuelOctaneEstimator');
const { OctaneUI } = require('./src/ui');

// App context is provided by the MGU runtime.
// eslint-disable-next-line no-unused-vars
module.exports = function (ctx) {
  console.log('[OctaneEstimator] starting');

  // Load algorithm config from app.json if available
  let algoConfig = {};
  try {
    const appCfg = ctx.app && ctx.app.config;
    if (appCfg && appCfg.algorithm) algoConfig = appCfg.algorithm;
  } catch (e) {
    console.warn('Could not read app config, using defaults', e);
  }

  const estimator = new FuelOctaneEstimator(algoConfig);
  const ui = new OctaneUI(ctx);

  // Reset button handler
  ui.onReset = () => {
    estimator.reset();
    ui.update(estimator.estimate());
    ui.history = [];
    ui.drawSparkline();
    console.log('[OctaneEstimator] statistics reset');
  };

  // Watch signals
  const signalHub = watchAll(ctx, (key, value) => {
    // Optional: log raw signals for debugging
    // console.log(`signal ${key} = ${value}`);
  });

  // Main update loop (e.g., every 500 ms)
  const UPDATE_INTERVAL_MS = 500;
  let lastSampleTime = 0;

  ctx.loop(() => {
    const now = Date.now();
    if (now - lastSampleTime < UPDATE_INTERVAL_MS) return;
    lastSampleTime = now;

    const v = signalHub.values;

    // Build data object
    const data = {
      coolantTemp: v.coolantTemp,
      rpm: v.engineSpeed,
      massAirFlow: v.massAirFlow,
      ignitionTiming: v.ignitionTiming,
      timingCorrectionLong: v.timingCorrectionLong,
      timingCorrectionShort: v.timingCorrectionShort,
      knockRetard: v.knockRetard,
    };

    // Feed estimator
    const accepted = estimator.addSample(data, now);

    // Update UI with current estimate
    const est = estimator.estimate();
    ui.update(est);

    // Optional sparkline: add history point if sample accepted
    if (accepted) {
      const longCorr = data.timingCorrectionLong || 0;
      const shortCorr = data.timingCorrectionShort || 0;
      const knock = data.knockRetard || 0;
      const totalCorr = longCorr + shortCorr - knock;
      ui.addHistoryPoint(now, totalCorr);
    }
  });

  // Cleanup on app exit (if the runtime calls this)
  ctx.onExit = () => {
    signalHub.stopAll();
    if (ctx.controller) ctx.controller.grab(false);
  };
};
