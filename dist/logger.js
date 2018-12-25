const { inspect } = require('util');
const symbols = require('log-symbols');
const ora = require('ora');

const SYMBOL_MAP = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  ok: 'success'
};

/**
 * Creates a new Logger instance.
 */
module.exports = function createLogger() {

  /**
   * Logs a message to console.
   * 
   * @param {string} sym a log symbol to prefix log message.
   * @param {any} msg object error or string to log.
   * @param {any[]} args rest array of arguments for formatting message.
   * 
   * @returns {log}
   */
  function log(sym, msg, ...args) {

    const hasSym = SYMBOL_MAP[sym];

    if (!hasSym) {
      if (typeof msg !== 'undefined')
        args.unshift(msg);
      msg = sym;
    }

    sym = hasSym ? symbols[hasSym] : undefined;

    msg = msg || '';

    if (msg instanceof Error) {
      msg = msg.stack || msg.message;
    }

    else if (typeof msg === 'object') {
      msg = inspect(msg, null, null, true);
    }

    let prefix = (msg.match(/^\n+/) || [''])[0].length;
    let suffix = (msg.match(/\n+$/) || [''])[0].length;

    msg = msg.replace(/^\n+/, '').replace(/\n+$/, '');

    msg = sym ? sym + ' ' + msg : msg;

    if (prefix)
      msg = '\n'.repeat(prefix) + msg;

    if (suffix)
      msg += '\n'.repeat(suffix);

    const logger = console[sym] || console.log;

    logger(msg, ...args);

    return log;

  }

  ['error', 'warn', 'info', 'ok']
    .forEach(k => log[k] = (msg, ...args) => log(k, msg, ...args));

  /**
   * Ora spinner instance.
   */
  log.spinner = undefined;

  /**
   * Starts spinning new Ora spinner instance or using existing.
   * 
   * @param {string|object} text a string for spinner or options object.
   * @param {object} opts options for Ora spinner.
   * 
   * @returns {log.spinner}
   */
  log.spin = (text, opts) => {
    if (typeof text === 'string') {
      opts = { ...opts };
      opts.text = text;
    }
    if (log.spinner) {
      return log.spinner.stop().start(text);
    }
    else {
      log.spinner = ora(opts);
      return log.spinner.start();
    }
  };

  /**
   * Stops Ora spinner instance.
   * 
   * @returns {log.spinner}
   */
  log.stop = () => {
    if (log.spinner)
      log.spinner.stop();
    return log.spinner;
  };

  /**
   * Logs out generator validation report.
   * 
   * @param {object} validator a generator validation report object.
   * @param {boolean} exit when true exit on invalid report.
   */
  log.validator = (validator, exit = true) => {
    if (!validator.invalid)
      return;
    log();
    log(`Validation Error (${validator.name}):`);
    log();
    if (validator.messages.length)
      validator.messages.forEach(m => log.error(m));
    log();
    if (exit)
      log.exit(1);
  };

  /**
   * Exits the process.
   * 
   * @param {number} code a node process.exit code.
   */
  log.exit = process.exit;

  return log;

};