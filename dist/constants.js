const { existsSync } = require('fs-extra');
const { join } = require('path');
const pkgPath = join(process.cwd(), 'package.json');

const PKG = existsSync(pkgPath) ? require(pkgPath) : {};
const NAME = 'Kopie';
const NAME_LOWER = 'kopie';
const PKG_CONFIG = (PKG.kopie || {});
const KOPIE_PATH = join(process.cwd(), (PKG_CONFIG.path || `./.${NAME_LOWER}`));
const BIN = 'ko';
const CWD = process.cwd();
const EXT = '.hbs';

const PATHS = {
  kopie: KOPIE_PATH,
  actions: join(KOPIE_PATH, 'actions'),
  config: join(KOPIE_PATH, 'config.json'),
  blueprints: join(KOPIE_PATH, 'blueprints'),
  backups: join(KOPIE_PATH, 'backups')
};

const COMMANDS = {
  init: {
    args: [],
    alias: ['i']
  },
  config: {
    args: ['<action>', '[key]', '[value]'],
    alias: ['cfg', 'c']
  },
  generate: {
    args: ['<name> [path]'],
    alias: ['gen', 'g']
  }
};

const OPTIONS = {
  help: {
    type: 'boolean',
    alias: ['-h']
  },
  force: {
    type: 'boolean',
    alias: ['-f']
  },
  purge: {
    type: 'boolean',
    alias: ['-p']
  },
  silent: {                // when present don't prompt for inject previews.
    type: 'boolean',
    alias: ['-s']
  }
};

const ALIASES = Object.keys(COMMANDS).reduce((a, c) => {
  const cmd = COMMANDS[c];
  a[c] = c;
  cmd.alias.forEach(k => a[k] = c);
  return a;
}, {});

module.exports = {
  PKG,
  NAME,
  NAME_LOWER,
  KOPIE_PATH,
  BIN,
  CWD,
  EXT,
  PATHS,
  COMMANDS,
  ALIASES,
  OPTIONS
};