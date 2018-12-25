
const kopie = require('./kopie');
const kawkah = require('kawkah-parser');
const dp = require('dot-prop');
const { ALIASES, OPTIONS, COMMANDS, PATHS, BIN } = require('./constants');
const { existsSync } = require('fs-extra');
const { inspect } = require('util');
const initHelp = require('./help');

const args = kawkah.parse(process.argv.slice(2), {
  options: { ...OPTIONS }
});

const log = kopie.log;

const origCmd = args._[0];
const aliasCmd = ALIASES[origCmd];
const knownCmd = aliasCmd && COMMANDS[aliasCmd];

// Load generator actions.
let initActions;
if (existsSync(PATHS.actions))
  initActions = require(PATHS.actions);

let cmd;
if (knownCmd) {
  cmd = aliasCmd;
  args._.shift();
}

// Ensure we have a valid config.
if (!kopie.config && cmd !== 'init')
  log.error(`\nMissing config try running "${BIN} init"\n`).exit(1);

if (cmd === 'init') {
  kopie.init(args.force);
  process.exit(0);
}

else {

  // Sync the config with blueprints directory.
  const config = kopie.syncConfig();

  if (!origCmd || origCmd && args.help) {

    // Initialize help.
    const help = initHelp(kopie);

    // Command Help //
    if (origCmd) {

      if (!COMMANDS[cmd])
        log.warn(`Cannot display help for uknown command "${origCmd}"`).exit(0);

      help.show(cmd);

    }

    // General Help //
    else if (args.help) {
      help.show('main');
    }


  }

  // Handle Commands //

  else {

    // Ensure valid command.
    if (!knownCmd)
      log.warn(`Cannot run unknown command "${origCmd}"`).exit(0);


    ////////////////////////////
    // CONFIG
    ////////////////////////////


    if (cmd == 'config') {

      const actions = ['get', 'show', 'set', 'del'];
      const actionsList =
        actions.slice(0, actions.length - 1).join(', ')
        + ' or ' + actions[actions.length - 1];

      const action = args._[0];
      let key = args._[1];
      const value = args._[2];

      if (args.purge) {
        log();
        kopie.syncGenerators(args.purge);
        if (!action)
          process.exit();
      }

      if (action !== 'show' && !key)
        log.warn(`Config quit cannot "get" with key of undefined`).exit();

      let previous;

      if (key)
        previous = dp.get(config, key);

      if (typeof previous !== 'undefined' && (Array.isArray(previous) || typeof previous === 'object'))
        previous = inspect(previous, null, null, true);

      // If generator normalize dot notation.
      if (/^generators/.test(key)) {
        let parts = key.split('.').slice(1);
        const alias = kopie.aliasToKey(parts.shift());
        key = parts = ['generators', alias, ...parts].join('.');
      }

      switch (action) {

        case 'show':
          if (args.purge)
            log();
          log(config);
          log();
          break;

        case 'get':
          log();
          log(dp.get(config, key));
          log();
          break;

        case 'set':
          if (typeof value === 'undefined')
            log.warn(`Cannot "set" using value of undefined`).exit();
          dp.set(config, key, value);
          kopie.writeToFile(PATHS.config, JSON.stringify(config, null, 2));
          log();
          log.ok(`${key}:${value} (previous: ${previous})`);
          log();
          break;

        case 'del':
          dp.delete(config, key);
          kopie.writeToFile(PATHS.config, JSON.stringify(config, null, 2));
          log();
          log.ok(`${key} removed (previous: ${previous})`);
          log();
          break;

        default:

          if (!action)
            log.warn(`Config requires and action of type: "${actionsList}"`).exit();

          log.warn(`Config quit, unknown action "${action}" NOT found`);

          break;

      }

    }

    ////////////////////////////
    // GENERATOR
    ////////////////////////////

    else {

      // Lookup generator.
      const conf = kopie.loadGenerator(args._[0]);

      // Generators must have an action.
      if (!conf || !conf.action)
        log.error(`Unknown generator "${args._[0]}" or missing generator action`).exit(1);

      // Remove the generator name from args.
      args._.shift();

      // We need our actions now load them.
      const actions = initActions(kopie);
      const action = actions[conf.action];

      if (!action)
        log
          .error(`Action for generator "${conf.name}" could not be found, ensure exists in actions.js`)
          .exit(1);

      const defs = conf.defaults;
      const clone = { ...defs };
      delete clone.args; // we need to convert this from args: [] to _: [];

      let merged = { ...clone, ...args };

      // Iterate default args ensure values.
      (defs.args || []).forEach((a, i) => {
        if (typeof merged._[i] === 'undefined')
          merged._[i] = defs.args[i];
      });

      // Call the action.
      action(conf, merged);

    }

  }

}

