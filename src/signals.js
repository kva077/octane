/**
 * Wrapper for CAN/SOME/IP signals using ctx.signals.watch.
 * Provides safe subscription with error handling and fallback values.
 */

const SIGNAL_NAMES = {
  ignitionTiming: 'DME.IgnitionTiming',
  timingCorrectionLong: 'DME.IgnitionTimingCorrectionLong',
  timingCorrectionShort: 'DME.IgnitionTimingCorrectionShort',
  knockRetard: 'DME.KnockRetard',
  coolantTemp: 'DME.CoolantTemp',
  engineSpeed: 'DME.EngineSpeed',
  massAirFlow: 'DME.MassAirFlow'
};

/**
 * Watch a single signal. Returns an object with current value and unsubscribe.
 * @param {object} ctx - app context
 * @param {string} signalKey - key from SIGNAL_NAMES
 * @param {function} onUpdate - callback(newValue)
 */
function watchSignal(ctx, signalKey, onUpdate) {
  const iface = SIGNAL_NAMES[signalKey];
  if (!iface) {
    console.warn(`Unknown signal key: ${signalKey}`);
    return { get: () => null, unsubscribe: () => {} };
  }

  let lastValue = null;
  let unsubscribe = null;

  try {
    // ctx.signals.watch(iface, instance, handlers)
    // Instance is usually 0 for DME signals; adjust per car if needed.
    unsubscribe = ctx.signals.watch(iface, 0, (value) => {
      lastValue = value;
      if (onUpdate) onUpdate(value);
    });
  } catch (err) {
    console.error(`Failed to watch ${iface}:`, err);
  }

  return {
    get: () => lastValue,
    unsubscribe: () => {
      if (unsubscribe) unsubscribe();
    }
  };
}

/**
 * Watch all required signals at once. Returns a map of watchers and a
 * combined getter.
 */
function watchAll(ctx, onAnyUpdate) {
  const watchers = {};
  const values = {
    ignitionTiming: null,
    timingCorrectionLong: null,
    timingCorrectionShort: null,
    knockRetard: null,
    coolantTemp: null,
    engineSpeed: null,
    massAirFlow: null
  };

  for (const key of Object.keys(SIGNAL_NAMES)) {
    watchers[key] = watchSignal(ctx, key, (val) => {
      values[key] = val;
      if (onAnyUpdate) onAnyUpdate(key, val);
    });
  }

  return {
    values,
    watchers,
    stopAll: () => {
      for (const w of Object.values(watchers)) w.unsubscribe();
    }
  };
}

module.exports = { SIGNAL_NAMES, watchSignal, watchAll };
