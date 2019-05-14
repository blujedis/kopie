const { join } = require('path');
const Tablur = require('tablur').Tablur;
const { NAME, BIN, COMMANDS, OPTIONS } = require('./constants');

const toFlag = (flag) => {
  flag = flag.replace(/--?/, '');
  return (flag.length === 1 ? '-' + flag : '--' + flag);
};

const toFlags = (arr) => {
  const clone = [...arr];
  return clone.map(toFlag);
};

const toTime = (epoch) => {
  if (typeof epoch === 'string')
    epoch = parseInt(epoch);
  const d = new Date(epoch);
  return d.toUTCString();
};

module.exports = function initHelp(kopie) {

  const config = kopie.config;
  const usage = '$0 <command> [options]';
  const baseUsage = usage.replace('$0', BIN);

  const usages =
    Object.keys(COMMANDS)
      .reduce((a, c) => {
        const cmd = COMMANDS[c];
        let cmdStr = c + ' ';
        if (cmd.args.length)
          cmdStr += cmd.args.join(' ');
        a[c] = `${BIN} ${cmdStr}`;
        return a;
      }, {});

  // Command Aliases //

  const initAlias = [COMMANDS.init.alias.join(', ')];
  const configAlias = [COMMANDS.config.alias.join(', ')];
  const genAlias = [COMMANDS.generate.alias.join(', ')];
  const restAlias = [COMMANDS.restore.alias.join(', ')];

  // Option Aliases //

  const helpOpts = ['--help', ...toFlags(OPTIONS.help.alias)].join(', ');
  const forceOpts = ['--force', ...toFlags(OPTIONS.force.alias)].join(', ');
  const purgeOpts = ['--purge', ...toFlags(OPTIONS.purge.alias)].join(', ');
  const silentOpts = ['--silent', ...toFlags(OPTIONS.silent.alias)].join(', ');

  function show(key) {

    const table = new Tablur();
    const desc = `A scaffolding utility leveraging Handlebars template compiler and Handlebars-Helpers see: https://github.com/helpers/handlebars-helpers`;

    switch (key) {

      case 'main':

        table.clear();

        table
          .row()
          .row('Kopie Scaffolding Utility')
          .row()
          .row([desc], { width: 40 })
          .row()
          .row([`usage: ${baseUsage}`])
          .row()
          .row('Commands:')
          .row([usages.init, `Initialize ${NAME}`, `alias: ${initAlias}`], { indent: 2 })
          .row([usages.config, `Displays sets or gets config properties`, `alias: ${configAlias}`], { indent: 2 })
          .row([usages.generate, `Generates a named component`, `alias: ${genAlias}`], { indent: 2 })
          .row([usages.restore, `Restores a backup`, `alias: ${restAlias}`], { indent: 2 })
          .row()
          .row('Options:')
          .row([helpOpts, `--help or <command> --help`], { indent: 2 })
          .row([purgeOpts, `purges generators or restore points`], { indent: 2 })
          .row([forceOpts, `forces command action`], { indent: 2 })
          .row([silentOpts, `suppresses confirm previews`], { indent: 2 })
          .row();

        table.render();

        break;

      case 'init':

        table.clear();

        table
          .row()
          .row([usage.init, `alias: ${initAlias}`])
          .row()
          .row('Description:')
          .row(`Initializes app for use with ${NAME}`, { indent: 2 })
          .row()
          .row('Options:')
          .row([forceOpts, `forces action`], { indent: 2 })
          .row();

        table.render();

        break;

      case 'config':

        table.clear();

        table
          .row()
          .row([usages.config, `alias: ${configAlias}`])
          .row()
          .row('Description:')
          .row(`Displays sets and gets config properties`, { indent: 2 })
          .row(`Actions - show, get, set, del or add`, { indent: 2 })
          .row()
          .row('Options:')
          .row([forceOpts, `forces action`], { indent: 2 })
          .row([purgeOpts, `purges unknown generators`], { indent: 2 })
          .row();

        table.render();

        break;

      case 'generate':

        table.clear();

        table
          .row()
          .row([usages.generate, `alias: ${genAlias}`])
          .row()
          .row('Description:')
          .row(`Generates template from blueprint(s)`, { indent: 2 })
          .row()
          .row('Options:')
          .row([forceOpts, `forces action`], { indent: 2 })
          .row()
          .row('Generators:');

        Object.keys(config.generators).forEach(k => {
          const conf = config.generators[k];
          const output = join(config.root || '.', conf.base || '');
          const type = conf.isDirectory ? 'directory' : 'file';
          table.row([conf.name, conf.description || '', output, type], { indent: 2 });
        });

        table
          .row()
          .render();

        break;

      case 'restore':

        table.clear();

        table
          .row()
          .row([usages.restore, `alias: ${restAlias}`])
          .row()
          .row('Description:')
          .row(`Restores template(s) from backup`, { indent: 2 })
          .row()
          .row('Options:')
          .row([purgeOpts, `purges restore point`], { indent: 2 })
          .row()
          .row('Restore Points:');

        Object.keys(kopie.backups).reverse().forEach(k => {
          const bkup = kopie.backups[k];
          table.row();
          table.row([k + ` (${toTime(k)})`], { indent: 2 });
          bkup.items.forEach(item => {
            table.row([item.to || 'DELETE', '>>', item.from], { indent: 4 });
          });
        });

        table
          .row()
          .render();

        break;

      default:
        break;

    }

  }

  return {
    usage,
    usages,
    show
  };

};