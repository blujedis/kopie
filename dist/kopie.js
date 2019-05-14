/**
 * see: https://handlebarsjs.com/
 * see: https://github.com/helpers/handlebars-helpers
 */
const Handlebars = require('handlebars');
const helpers = require('handlebars-helpers')();
const Tablur = require('tablur').Tablur;
const { relative, join, parse, resolve } = require('path');
const readline = require('readline');
const { writeFileSync, writeFile, copySync, existsSync,
  readFileSync, ensureDirSync, readdirSync, unlinkSync } = require('fs-extra');
const glob = require('fast-glob').sync;
const log = require('./logger')();

const { PKG, CWD, NAME, NAME_LOWER, KOPIE_PATH, BIN, PATHS, EXT } = require('./constants');
const hasOwn = (o, k) => o.hasOwnProperty(k);

let config, extExp, backups;
let ext = EXT;

if (existsSync(PATHS.config)) {
  config = require(PATHS.config);
  ext = '.' + (config.ext || ext).replace(/^\./, '');
}

backups = getBackups();

extExp = new RegExp(ext + '$');

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

const api = {
  PKG,
  NAME,
  NAME_LOWER,
  BIN,
  CWD,
  PATHS,
  Tablur,
  Handlebars,
  log,
  init,
  aliasToKey,
  toNormalKey,
  fromNormalKey,
  extendConfig,
  pathToPropName,
  config,
  backups,
  loadBlueprints,
  addGenerators,
  purgeGenerators,
  inspectGenerators,
  syncGenerators,
  syncConfig,
  loadGenerator,
  validateGenerator,
  normalizeDest,
  resolveDest,
  resolveTemplateMap,
  readTemplate,
  writeToFile,
  compileTemplate,
  compileTemplates,
  renderTemplate,
  renderTemplates,
  render,
  restore
};

/**
 * Generator config required.
 * 
 * @typedef {{ args: string[], options: string[], props: string[] }} GeneratorConfigRequired
 */

/**
* Generator config defaults.
*
* @typedef {{ args: string[], options: {}, props: {} }} GeneratorConfigDefaults
*/

/**
 * 
 * @typedef {{ [key: string]: InjectConfig }} InjectConfigs
 */

/**
 * Generator config object.
 * 
 * @typedef {{ name: string, description: string, action: string, base: string, isDirectory: boolean, allowCopy: boolean, defaults: GeneratorConfigDefaults, required: GeneratorConfigRequired, injects: InjectConfigs }} GeneratorConfig
 */

/**
 * Render copy config.
 * @typedef {{root: string, base: string, src: string, dest: string, srcRel: string, destRel: string}} CopyMapItem
 */

/**
 * Render map config.
 * 
 * @typedef {{root: string, base: string, template: string, compiled: string, src: string, dest: string, srcRel: string, destRel: string, isAbsolute: boolean}} TemplateMapItem
 */

/**
 * 
 * @typedef {{ before: string[], after: string[], chunks: [], startIdx: number, endIdx: number, endEmpty: boolean}} InjectChunks 
 */

/**
 * Inject action configuration object.
 * 
 * @typedef {{ start: string | RegExp, end: string | RegExp | null, strategy: 'beforeStart' | 'beforeEnd' | 'afterStart', 'afterEnd', 'replace', templates: string | string[], props: object }} InjectAction
 */

/**
 * Inject configuration object.
 * 
 * @typedef {{ target: string, actions: InjectAction[] }} InjectConfig
 */

/**
*  Backup manifest item.
* 
* @typedef {{ from: string, to: string }} BackupManifestItem
*/

/**
*  Backup manifest object.
* 
* @typedef {{ timestamp: number, items: BackupManifestItem[] }} BackupManifest
*/

// Handlebars Helpers 
// --------------------------------------------- //

Handlebars.registerHelper('relativeToParent', function (parent, child) {
  return relative(parent, child);
});


/**
 * Creates stream reader prompt using Node's readline lib.
 * 
 * @see https://nodejs.org/api/readline.html#readline_example_tiny_cli
 * 
 * @param {string|object} prompt string to prompt with or object of options.
 * @param {NodeJS.ReadStream} input the writeable input stream.
 * @param {NodeJS.WriteStream} output the output write stream.
 */
function createReadInterface(prompt, input, output) {

  const defaults = {
    input: process.stdin,
    output: process.stdout,
    prompt: `${NAME_LOWER}> `
  };

  let options = {};

  if (typeof prompt === 'object') {
    options = prompt;
    prompt = undefined;
  }

  options = { ...defaults, ...options };
  options.input = input || options.input;
  options.output = output || options.output;

  const rl = readline.createInterface(options);

  return rl;

}

/**
 * Initialize templating utility.
 * 
 * @param {boolean} force when true overwrite existing files.
 */
function init(force) {
  if (existsSync(KOPIE_PATH) && !force)
    log.warn(`\nWhoops ${NAME} already initialized, use "force" to overwrite\n`).exit(0);
  const seedPath = join(__dirname, '../', 'seed');
  log();
  log.info(`Initializing ${NAME}`);
  log.info(`Copying files from: ${seedPath} to: ${relative(CWD, KOPIE_PATH)}`);
  copySync(seedPath, KOPIE_PATH);
  log.ok(`\n${NAME} successfully initialized\n`);
}

/**
 * Converts an alias to a named generator key.
 * 
 * @param {string} name the name to inspect for alias.
 * 
 * @returns {string}
 *
 */
function aliasToKey(name) {
  if (!config.allowAliases || typeof name === 'undefined')
    return name;
  return config.aliases[name] || name;
}

/**
 * Normalizes generator key name removing any "."
 * 
 * @param {string} name a generator name.
 */
function toNormalKey(name) {
  if (!~name.indexOf('.'))
    return name;
  return name.replace(/\./g, '-');
}

/**
 * Normalizes generator key converting "-" to "."
 * 
 * @param {string} name a generator name.
 */
function fromNormalKey(name) {
  if (!name.indexOf('-'))
    return name;
  return name.replace(/-/g, '.');
}

/**
 * Extends generator config ensuring.
 * 
 * @param {object} target generator configuration object.
 * @param {object} source exting config or values to overwrite target with.
 * 
 * @returns {GeneratorConfig}
 */
function extendConfig(target, source) {
  let output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = extendConfig(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

/**
 * Checks if props.name is required, if missing attempts to convert the
 * path directory name to prop.name.
 * 
 * @param {GeneratorConfig} conf the generator's config.
 * @param {object} args parsed cli args.
 * 
 * @returns {object}
 */
function pathToPropName(conf, args) {

  const defaults = {
    required: { props: [] },
    defaults: { props: {} }
  };

  args.props = args.props || {};
  conf = extendConfig(defaults, conf);

  if (~conf.required.props.indexOf('name') && !args.props.name && !conf.defaults.props.name) {

    const name = parse(args._[0]).name;

    if (name)
      args.props.name = name;

  }

  return args;

}

/**
 * Uses glob pattern to load each blueprint
 * in blueprints directory.
 */
function loadBlueprints() {

  const transform = (v => {
    if (/\/$/.test(v)) {
      // let f = readdirSync(v).reduce((a, c) => {
      //   return extExp.test(c) ? [...a, c] : a;
      // }, []);
      let f = readdirSync(v).filter(v => /\..+$/.test(v));
      if (!f.length)
        return '';
    }
    return relative(PATHS.blueprints, v);
  });

  const files = glob(PATHS.blueprints + `/*${ext}`, { onlyFiles: true, transform });
  const dirs = glob(PATHS.blueprints + '/**/*', { onlyDirectories: true, transform, markDirectories: true }).filter(v => v.length);

  return [...files, ...dirs];

}

/**
 * Inspects and normalizes generators optionally purges invalid or missing.
 * 
 * @param {boolean} purge causes missing or invalid to be removed.
 * 
 * @returns {{ key: string, conf: GeneratorConfig, msg: string}[]}
 */
function inspectGenerators(purge) {

  const removed = [];

  const genKeys = Object.keys(config.generators);

  // Ensure generators exist.
  genKeys.forEach(key => {

    // If key has dot notation 
    const invalidKey = /\..+$/.test(key);

    const origKey = fromNormalKey(key);
    const hasExt = /\..+$/.test(origKey);

    let path = !hasExt ? origKey : origKey + ext;

    path = join(PATHS.blueprints, path);

    // Ensure required keys.
    let conf = config.generators[key];
    const tmp = { name: key };
    conf = { ...tmp, ...conf };

    if (conf.name !== key)
      conf.name = key;

    if (purge && !conf.isStatic && (!existsSync(path) || invalidKey)) {

      let msg = `Removed generator "${key}" path does NOT exist`;

      if (invalidKey)
        msg = `Removed generator "${key}" unsuppored key name`;

      if (config.aliases[key])
        delete config.aliases[key];

      delete config.generators[key];

      removed.push({ key, conf, msg });

    }

    else {
      config.generators[key] = conf;
    }

  });

  if (purge) {

    const aliasKeys = Object.keys(config.aliases);

    // Purge aliases
    aliasKeys.forEach(k => {

      const val = config.aliases[k];

      if (!~genKeys.indexOf(val))
        delete config.aliases[k];

    });

  }

  return removed;

}

/**
 * Adds a generator to the configuration object.
 * 
 * @param {string} name the name of the generator.
 * @param {GeneratorConfig} conf generator onfiguration object.
 */
function addGenerator(name, conf) {

  const defaults = {
    action: 'default',
    isDirectory: false
  };

  const hasExt = /\..+$/.test(name);
  const hasTplExt = extExp.test(name);

  if (hasExt)
    name = parse(name).base;

  // If file has ext but 
  if (hasExt && !hasTplExt) return;

  // Blueprint templates must end in .hbs.
  let key = name.replace(extExp, '');
  let normalKey = toNormalKey(key);

  conf = extendConfig(defaults, conf);

  conf.name = normalKey;
  if (!conf.isStatic)
    conf.isDirectory = !hasTplExt;

  // Key was normalized from dot notation.
  if (normalKey !== key) {
    config.aliases[key] = normalKey;
  }

  if (config.generators[normalKey])
    return;

  config.generators[normalKey] = conf;

  const msg = `Generator "${key}" added to configuration`;

  return { key, conf, msg };

}

/**
 * Adds blueprint(s) to config.
 * 
 * @param {string|string[]} blueprints blueprint path array of blueprint names.
 * @param {object} defaults object used as defaults for generator.
 * 
 * @returns {{key: string, conf: GeneratorConfig, msg: string }[]}
 */
function addGenerators(blueprints, defaults) {

  if (!blueprints) return;

  if (!Array.isArray(blueprints))
    blueprints = [blueprints];

  defaults = defaults || {
    action: 'default',
    isDirectory: false
  };

  const added = [];

  blueprints.forEach((b) => {

    const result = addGenerator(b, defaults);

    if (result)
      added.push(result);


  });

  return added;

}

/**
 * Purge missing or invalid generators from config.
 * 
 * Placeholder currently just a wrapper to inspectGenerators.
 */
function purgeGenerators(purge) {
  return inspectGenerators(purge);
}

/**
 * Loads blueprints from blueprints directory and ensures
 * that there is a corresponding generator key in config.
 * 
 * @param {string|string[]|boolean} blueprints array of blueprint names or purge.
 * @param {object|boolean} defaults object used as defaults for generator or purge
 * @param {boolean} purge when true purges missing generators.
 * 
 * @returns {{added: {key: string, conf: GeneratorConfig }[], removed: {key: string, conf: GeneratorConfig }[]}}
 */
function syncGenerators(blueprints, defaults, purge) {

  if (typeof blueprints === 'boolean') {
    purge = blueprints;
    blueprints = undefined;
  }

  if (typeof defaults === 'boolean') {
    purge = defaults;
    defaults = undefined;
  }

  blueprints = blueprints || loadBlueprints();

  const added = addGenerators(blueprints, defaults);

  const removed = purgeGenerators(purge);

  writeToFile(PATHS.config, JSON.stringify(config, null, 2));

  // Persist the added Groups.
  if (added.length || removed.length) {

    if (added.length)
      log();

    added.forEach((o, i) => {
      log.ok(o.msg);
      log();
      log(o.conf);
      if (i < added.length - 1)
        log();
    });

    if (added.length && removed.length)
      log();

    removed.forEach((o, i) => {
      log.warn(o.msg);
      log();
      log(o.conf);
      if (i < removed.length - 1)
        log();
    });

  }

  return {
    added,
    removed
  };

}

/**
 * Loads generator from config.
 * 
 * @param {string} name the name of the generator to load.
 * @param {object} conf a configuration object to mixin.
 * 
 * @returns {object}
 */
function loadGenerator(name, conf) {

  name = aliasToKey(name);

  let gen = config.generators[name];

  if (!gen) return;


  conf = extendConfig(gen, conf);

  if (conf.extends && config.allowExtends) {
    const tmpConf = config.generators[conf.extends];
    // Omit unneeded keys from parent config.
    const { name, isStatic, ...extendConf } = tmpConf;
    conf = extendConfig(conf, extendConf);
  }

  let confPath;

  confPath = join(PATHS.blueprints, name, 'config.json');

  // If not extension (not a single file) check if has local config.
  if (conf.isDirectory && existsSync(confPath))
    conf = { ...require(confPath), ...conf };

  // Store the name for validation messages etc.
  conf.name = name;
  const alias = fromNormalKey(name);

  // Load files remove root directory strip template extension.
  let pattern = `${name}/**/*${ext}`;

  if (!conf.isDirectory)
    pattern = `${alias}${ext}`;

  conf.files = glob(join(PATHS.blueprints, pattern));

  if (conf.allowCopy)
    conf.copyFiles = loadCopyFiles(conf.base, conf.name);

  return conf;

}

/**
 * Validate loaded generator.
 * 
 * @param {object} conf the loaded generator config.
 * @param {object} args object containing parsed cli args.
 * @param {boolean} report when true report if invalid.
 * @param {boolean} exit when true exit after report when invalid.
 * 
 * @returns {object}
 */
function validateGenerator(conf, args, report = false, exit = false) {

  const validator = {
    name: conf.name,
    messages: [],
    invalid: false
  };

  let required = conf.required;
  required = { ...{ args: [], options: [], props: [] }, ...required };

  const hasFiles = (conf.files || []).length + (conf.copyFiles || []).length;

  if (!hasFiles) {
    validator.messages.push(`[FILES] expected at least 1 file but got 0`);
    validator.invalid = true;
  }

  required.args.forEach((k, i) => {
    if (typeof args._[i] === 'undefined') {
      validator.messages.push(`[ARGS] Missing required arg[${i}] "${k}"`);
      validator.invalid = true;
    }
  });

  required.options.forEach(k => {
    if (!hasOwn(args, k)) {
      validator.messages.push(`[OPTIONS] Missing required option "${k}"`);
      validator.invalid = true;
    }
  });

  required.props.forEach(k => {
    if (!hasOwn(args.props, k)) {
      validator.messages.push(`[PROPS] Missing required prop "${k}"`);
      validator.invalid = true;
    }
  });

  if (report === true && validator.invalid)
    log.validator(validator, exit);

  return validator;

}

/**
 * Normalizes the destination ensuring rendering output path.
 * 
 * @param {object} conf a loaded generator configuration object.
 * @param {string} dest the output destination to render to.
 * 
 * @returns {string}
 */
function normalizeDest(conf, dest) {

  const nameExt = conf.name.split('-')[1];

  if (!conf.isDirectory && !dest)
    dest = conf.name.replace(/-.+$/, '.' + nameExt);

  const parsed = parse(dest || '');

  if (!parsed.ext && !conf.isDirectory && !/\..+$/.test(dest))
    dest += ('.' + nameExt);

  if (!dest) return '';

  return dest;

}

/**
 * Check if output render path is absolute and is allowable.
 * 
 * @param {string} path checks if absolute path and if is allowable.
 * 
 * @returns {string}
 */
function checkAbsolute(path) {
  const isAbsolute = /^\//.test(path);
  if (config.allowAbsolute)
    return path;
  if (isAbsolute)
    path = path.slice(1);
  return path;
}

/**
 * Resolves the destination path joining optional base path if any.
 * 
 * @param {string} base the base path for the generator if any.
 * @param {string} dest the destination to resolve from base.
 * @param {string} root optional root path to override config.root.
 * 
 * @returns {string}
 */
function resolveDest(base, dest, root) {

  dest = checkAbsolute(dest);

  if (arguments.length === 1) {
    dest = base;
  }

  root = root || config.root || '.';
  base = base || '.';

  // Is absolute path ignore root & base just return.
  if (/^\//.test(dest)) {
    if (!config.allowAbsolute)
      dest = dest.slice(1);
    else
      return dest;
  }

  return join(resolve(config.root), base, dest);

}

/**
 * Loads files for a generator that are not templates but should be copied to output.
 * 
 * @param {string} base a base path to join to generator directory name.
 * @param {string} path the directory where copies are to be copied from.
 */
function loadCopyFiles(base, path) {
  const src = join(PATHS.blueprints, base || '', path);
  return glob([src + '/*', `!${src}/*${ext}`], { onlyFiles: true });
}

/**
 * Creates map of source and destination for rendering template(s) to file.
 * 
 * @param {GeneratorConfig} conf generator configuration object.
 * @param {string} dest the destination directory or file path.
 * 
 * @returns {{name: string, files: TemplateMapItem[], copyFiles: CopyMapItem[] }}
 */
function resolveTemplateMap(conf, dest) {

  dest = checkAbsolute(dest);

  const origDest = dest;
  const isAbsolute = /^\//.test(dest);
  const root = join(CWD, config.root);

  // Get resolved base route.
  dest = resolveDest(conf.base, dest);

  const defaultName = parse(dest).name;

  conf.files = conf.files || [];
  conf.copyFiles = conf.copyFiles || [];

  conf.files = conf.files.map(p => {

    const map = {
      root: config.root || '.',
      base: conf.base || '',
      template: undefined,
      compiled: undefined,
      src: p,
      dest: dest,
      srcRel: p,
      destRel: dest,
      isAbsolute
    };

    if (conf.isDirectory && !isAbsolute) {
      const parsed = parse(p);
      map.dest = join(dest, parsed.base).replace(extExp, '');
    }

    map.srcRel = relative(PATHS.kopie, map.src);

    if (!isAbsolute)
      map.destRel = relative(root, map.dest);

    return map;

  }, []);


  conf.copyFiles = conf.copyFiles.map(f => {

    const parsed = parse(f);
    const copyDest = join(root, origDest, parsed.base);

    const map = {
      root: config.root || '.',
      base: conf.base || '',
      src: f,
      dest: copyDest,
      srcRel: '',
      destRel: ''
    };

    map.srcRel = relative(PATHS.kopie, map.src);
    map.destRel = relative(root, map.dest);

    return map;

  });

  return {
    name: defaultName,
    files: conf.files,
    copyFiles: conf.copyFiles
  };

}

/**
 * Reads a template from file system.
 * 
 * @param {string} path a path to read from file system.
 * 
 * @returns {string}
 */
function readTemplate(path) {

  const hasExt = /\..+$/.test(path);

  // Probably a static template.
  // not a perfect solution.
  if (!hasExt)
    return path;

  return readFileSync(path, { encoding: 'utf8' });

}

/**
 * Compiles a template using Handlebars.
 * 
 * @param {string} template a template to be compiled.
 * @param {object} context an object containing context properties.
 * @param {object} options options to be passed to the compiler.
 * 
 * @returns {string}
 */
function compileTemplate(template, context, options) {
  template = Handlebars.compile(template, options);
  return template(context);
}

/**
 * Compiles templates from array of mapped src & dest.
 * 
 * @param {object} templates a map of src & dest for rendering templates.
 * @param {object} context object containing context properties.
 * @param {object} options object containing properties to pass to compiler.
 * @returns {TemplateMapItem[]}
 */
function compileTemplates(templates, context, options) {

  // Compile each template.
  return templates.map(m => {
    m.template = readTemplate(m.src);
    m.compiled = compileTemplate(m.template, context, options);
    return m;
  });

}

/**
 * Writes a compiled template or file to destination.
 * 
 * @param {string} template the compiled template or file to write.
 * @param {string} dest the file path to output the template to.
 * @param {boolean} force when true overwrites file if exists.
 * @param {BackupManifest} manifest manifest object for storing backups.
 * 
 * @returns {boolean}
 */
function renderTemplate(template, dest, force, manifest) {

  const rel = relative(CWD, dest);

  // Check if path already exists.
  if (existsSync(dest) && !force) {
    log.warn(`Path ${rel} exists, use --force to overwrite`);
    return false;
  }

  try {
    backup(dest, manifest);
    writeToFile(dest, template);
    return true;
  }
  catch (ex) {
    log.error(`Path "${rel}" failed: ${ex.message}`);
    return false;
  }

}

/**
 * Renders an array of compiled templates to file system.
 * 
 * @param {string[]} templates array of compiled templates to be rendered.
 * @param {boolean} force when true overwrites template if exists.
 * @param {BackupManifest} manifest manifest object for storing backups.
 * 
 * @returns {{ success: string[], failed: string[] }}
 */
function renderTemplates(templates, force, manifest) {

  const success = [];
  const failed = [];

  templates.forEach(m => {
    const rendered = renderTemplate(m.compiled, m.dest, force, manifest);
    if (rendered) success.push(m.destRel);
    else
      failed.push(m.destRel);
  });

  return {
    success,
    failed
  };

}

/**
 * Copies non template files for generator.
 * 
 * @param {string} src source path of file to copy.
 * @param {string} dest the destination path.
 * @param {boolean} force when true overwrite existing files.
 * @param {BackupManifest} manifest manifest object for storing backups.
 * 
 * @returns {{ success: string[], failed: string[] }}
 */
function copyFile(src, dest, force, manifest) {

  const rel = relative(CWD, dest);

  // Check if path already exists.
  if (existsSync(dest) && !force) {
    log.warn(`Path ${rel} exists, use --force to overwrite`);
    return false;
  }

  try {
    if (manifest)
      backup(src, manifest);
    copySync(src, dest);
    return true;
  }
  catch (ex) {
    log.error(`Path "${rel}" failed: ${ex.message}`);
    return false;
  }

}

/**
 * Copies files for generator.
 * 
 * @param {object[]} files array of copy files map.
 * @param {string} dest the directory to copy files to.
 * @param {boolean} force when true forces overwrite when exists.
 * @param {BackupManifest} manifest manifest object for storing backups.
 * 
 * @returns {{ success: string[], failed: string[] }}
 */
function copyFiles(files, force, manifest) {

  const success = [];
  const failed = [];

  files.forEach(m => {
    const copied = copyFile(m.src, m.dest, force, manifest);
    if (copied) success.push(m.destRel);
    else
      failed.push(m.destRel);
  });

  return {
    success,
    failed
  };

}

/**
 * Builds a list of templates about to be rendered.
 * Useful for user feedback to ensure we have the 
 * correct templates.
 * 
 * @param {object} renderMap object containing src and dest of templates to be rendered.
 */
function renderPreview(renderMap) {

  const table = new Tablur({ width: 0 });
  // const srcRel = `.${NAME_LOWER}`;
  // const destRel = config.root;

  const tplSuffix = ' (template)';
  const copySuffix = ' (copy)';

  renderMap.files.forEach(m => {
    table.row([m.srcRel, '>>', m.destRel, tplSuffix], { indent: 1 });
  });

  renderMap.copyFiles.forEach(m => {
    table.row([m.srcRel, '>>', m.destRel, copySuffix], { indent: 1 });
  });

  // table.row();
  // table.row(`Paths relative from: ${srcRel} >> ${destRel}`, { indent: 1 });

  return table.toString();

}

/**
 * Gets the existing backup manifest.
 */
function getBackups() {
  if (!existsSync(join(PATHS.kopie, 'backups.json')))
    return {};
  return JSON.parse(readFileSync(join(PATHS.kopie, 'backups.json')).toString());
}

/**
 * Saves the manifest with optional extend.
 * 
 * @param {{ [key: string]: BackupManifest }} manifest 
 * @param {BackupManifest} extend 
 */
function saveBackups(manifest, extend) {
  if (extend) {
    manifest = manifest || {};
    manifest[extend.timestamp] = extend;
  }
  writeToFile(join(PATHS.kopie, 'backups.json'), JSON.stringify(manifest, null, 2));
}

/**
 * Verifies and prompts before render and write of templates.
 * 
 * @param {GeneratorConfig} conf generator configuration object.
 * @param {object} args object of parsed args, options and context props.
 * @param {string} dest path to output destination.
 * @param {function} done callback on render complete.
 */
function render(conf, args, dest, done) {

  const rl = createReadInterface();
  done = done || (_ => _);

  // Validate the generator show report and exit if invalid.
  validateGenerator(conf, args, true, true);

  // Create map of source/dest
  const renderMap = resolveTemplateMap(conf, dest);
  const list = '\n' + renderPreview(renderMap) + '\n';
  const manifest = { timestamp: Date.now(), items: [] };
  const currentBackups = api.backups;

  function finish() {
    log();
    if (manifest.items.length)
      saveBackups(currentBackups, manifest);
    if (done)
      done();
    process.exit();
  }

  rl.question(`\nRender Preview (${conf.name})\n${list}\nAre you sure (y/N)? `, (answer) => {

    answer = (answer || '').trim().charAt(0).toLowerCase();

    rl.close();

    // If yes render the templates.
    if (answer === 'y') {

      log();

      // Read and compile the templates.
      const compiled = compileTemplates(renderMap.files, args.props);

      // Render the templates return success/fail result.
      const result = renderTemplates(compiled, args.force, manifest);

      const copied = copyFiles(renderMap.copyFiles, args.force, manifest).success.length;

      let method = result.success.length > result.failed.length ? 'ok' : 'warn';
      method = !result.success.length ? 'error' : method;

      log[method](`Render finished - ${result.success.length} successful ${result.failed.length} failed ${copied} copied`);

      if (!conf.injects)
        return finish();

      const injectKeys = Object.keys(conf.injects);

      if (!result.success.length && injectKeys.length) {
        log.warn(`Aborting inject, templates failed to render`);
        return finish();
      }

      if (conf.injects) {

        for (const k in conf.injects) {
          const _inject = conf.injects[k];
          _inject.defaultName = renderMap.name;
          args.silent = true;
          inject(k, _inject, args, null, manifest);
        }

      }

      finish();

    }
    else {
      finish();
    }

  });

}

/**
 * Compiles an action template for injection.
 * 
 * @param {object} conf the action configuration object.
 * 
 * @returns {{ compiled: string[], report: [string, string][]}}
 */
function compileActionTemplates(conf) {

  if (!Array.isArray(conf.templates))
    conf.templates = [conf.templates];

  const report = [];

  const compiled = conf.templates.map(v => {
    const c = compileTemplate(v, conf.props);
    report.push([v, c]);
    return c;
  });

  return {
    compiled,
    report
  };

}

/**
 * Finds matching lines based on start & end expressions setting end as null for first empty line found after start matched.
 * 
 * @param {string[]} lines array of string split from target file.
 * @param {string | RegExp} start the expression to find as inject start index.
 * @param {string | RegExp | null} end the expression to find as inject end index.
 * 
 * @returns {InjectChunks}
 */
function findChunks(lines, start, end) {


  // If not start position assume first line.
  start = start || lines[0];

  // Default to null which will look for empty line.
  end = typeof end === 'undefined' ? null : end;

  // If string convert to exp
  if (typeof start === 'string')
    start = new RegExp('^' + start);

  if (typeof end === 'string')
    end = new RegExp('^' + end);

  if (!(start instanceof RegExp))
    log.error(`Expected chunk start to be RegExp, but got typeof ${typeof start}`).exit();

  if (!(end instanceof RegExp) && end !== null && end !== false)
    log.error(`Expected chunk end to be RegExp, null or false, but got typeof ${typeof start}`).exit();


  const result = lines.reduce((a, c, i) => {

    if (a.started && a.ended)
      a.after.push(c);

    // If started check for inner chunks until end.
    if (a.started && !a.ended) {

      // Otherwise test expression.
      if (end instanceof RegExp && end.test(c)) {
        a.chunks.push(c);
        a.ended = true;
        a.endIdx = i;
      }

      // Checking for first empty line.
      else if (end === null && c === '') {
        a.chunks.push(c);
        a.ended = true;
        a.endEmpty = true; // indicate last line in chunks is empty line.
        a.endIdx = i;
      }

      // We are replacing so the already found row just end.
      else if (end === false) {
        a.ended = true;
        a.endIdx = Math.max(0, i - 1);
      }

      else {
        a.chunks.push(c);
      }

    }

    if (!a.started) {

      // Otherwise test expression.
      if (start instanceof RegExp && start.test(c)) {
        a.chunks.push(c);
        a.started = true;
        a.startIdx = i;
      }

    }

    if (!a.started)
      a.before.push(c);


    return a;

  }, {
      before: [],
      after: [],
      chunks: [],
      started: false,
      ended: false,
      startIdx: null,
      endIdx: null,
      endEmpty: false
    });

  const { started, ended, ...cleaned } = result;

  return cleaned;

}

/**
 * Injects based on action configuration object.
 * 
 * @param {string[]} lines array of lines split from target file.
 * @param {InjectAction} conf the inject action configuration object.
 * 
 * @returns {{ lines: string[], report: [string, string][] }}
 */
function injectAction(lines, conf) {

  if (conf.strategy === 'replace')
    conf.end = false;

  // Breakout lines into chunks of lines before/after and found.
  const parsed = findChunks(lines, conf.start, conf.end);

  // Compile templates to inject.
  const result = compileActionTemplates(conf);
  const { compiled } = result;

  switch (conf.strategy) {

    // Inject BEFORE the first line in found chunks.
    case 'beforeStart': {
      parsed.chunks = [...compiled, ...(parsed.chunks)];
      break;
    }

    // Inject AFTER the first line in found chunks.
    case 'afterStart': {
      const first = parsed.chunks.shift();
      parsed.chunks = [first, ...compiled, ...(parsed.chunks)];
      break;
    }


    // Inject BEFORE the last line in our found chunks.
    case 'beforeEnd': {
      let last = parsed.chunks.pop();
      parsed.chunks = [...(parsed.chunks), ...compiled];
      //if (!parsed.endEmpty)
      parsed.chunks.push(last);

      break;
    }

    // Inject AFTER the last line in our found chunks.
    case 'afterEnd': {
      if (parsed.endEmpty);
      parsed.chunks.pop();
      parsed.chunks = [...(parsed.chunks), ...compiled];
      if (parsed.endEmpty)
        parsed.chunks.push('');
      break;
    }

    // Replace the found chunk throw error if more than one line found.
    case 'replace': {
      parsed.chunks = compiled;
      break;
    }

  }

  return {
    lines: [...(parsed.before), ...(parsed.chunks), ...(parsed.after)],
    report: result.report
  };

}

/**
 * Finds by expression and injects into file.
 * 
 * @param {string} name the name of the inject configuration.
 * @param {InjectConfig} conf the inject configuration object.
 * @param {object} args parsed command args containing props.
 * @param {function} done callback when finished.
 * @param {BackupManifest} manifest manifest object for storing backups.
 */
function inject(name, conf, args, done, manifest) {

  const origTarget = conf.target;

  const rl = createReadInterface();
  done = done || (_ => _);

  const target = resolve(conf.target);

  let lines = readFileSync(target, 'utf8').toString().split('\n');

  let reports = {};
  let modified = 0;

  let injected = [...lines];

  // Inject our templates and rebuild lines.
  conf.actions.forEach(c => {

    // Extend props from args.
    c.props = { ...(args.props), ...(c.props) };

    // Get default parent name from destination if name not already defined.
    c.props.name = c.props.name || conf.defaultName;

    const result = injectAction(lines, c);
    lines = result.lines;
    reports[c.start] = result.report;
    modified += result.report.length;
    injected = result.lines;
  }, []);

  // Build Table Preview //

  const table = new Tablur({ width: 0 });

  table.row(`Injected: ${origTarget}`).row();

  for (const k in reports) {
    const transforms = reports[k];
    table.row([k]);
    transforms.forEach(t => {
      table.row([t[0], '>>', t[1], ''], { indent: 1 });
    });
  }

  function complete() {
    if (manifest)
      backup(target, manifest);
    writeFileSync(target, injected.join('\n'), 'utf8');
    log.ok(`Injected ${name} successfully - modified ${modified} line(s)`);
    done();
  }

  if (args.silent)
    return complete();

  // Prompt user with preview of action.

  rl.question(`\nInject Preview (${name})\n${table.toString()}\nAre you sure (y/N)? `, (answer) => {
    answer = (answer || '').trim().charAt(0).toLowerCase();
    rl.close();
    // If yes render the templates.
    if (answer === 'y') {
      complete();
    }
    else {
      log();
      complete();
    }
  });
}

/**
 * Backsup a file that is to be replaced or modified.
 * 
 * @param {string} path path the file is to be copied.
 * @param {BackupManifest} manifest manifest object for storing backups.
 */
function backup(path, manifest) {

  const ts = ((manifest && manifest.timestamp) || Date.now()) + '';
  let base = join(PATHS.backups, ts);

  path = resolve(path);
  const relPath = relative(CWD, path);
  const dest = join(base, relPath);
  const relDestPath = relative(CWD, dest);

  const result = {
    from: relPath,
    to: ''
  };

  if (existsSync(path)) {
    log.info(`Backing up file ${relPath} >> ${relDestPath}`);
    copySync(path, dest);
    result.to = relDestPath;
    if (manifest)
      manifest.items.push(result);
    return result;
  }
  else {
    if (manifest)
      manifest.items.push(result);
    return result;
  }

}

/**
 * Restores files from a backup.
 * 
 * @param {number} id the backup id to be restored.
 * @param {boolean} purge when true purge the key from backups.json
 */
function restore(id, purge) {

  const keys = Object.keys(backups);
  const last = keys.pop();

  const origId = id;
  id = id || last;

  if (!id)
    log.error(`Cannot find restore point undefined`).exit();

  if (purge) {
    if (!backups[origId]) {
      log.warn(`Failed to purge restore point ${id}, could NOT be found`).exit();
    }
    else {
      delete backups[origId];
      saveBackups(backups);
      log.ok(`Removed restore point ${id} successfully`).exit();
    }

  }

  const table = new Tablur();

  table.row();
  backups[id].items.forEach(item => {
    table.row([item.to || 'DELETE', '>>', item.from], { indent: 2 });
  });
  table.row();

  const rl = createReadInterface();

  rl.question(`\nRestore Preview (${id})\n${table.toString()}\nAre you sure (y/N)? `, (answer) => {

    answer = (answer || '').trim().charAt(0).toLowerCase();

    rl.close();

    if (answer !== 'y') {

      log.warn(`Restore ${id} has aborted`).exit();

    }
    else {

      const bkup = backups[id];
      const failed = [];

      if (!bkup || !bkup.items || !bkup.items.length) {
        log.warn(`Purging empty restore point ${id}, nothing to do!`);
        delete backups[id];
        saveBackups(backups);
        process.exit();
      }

      bkup.items.forEach(item => {

        if (!item.to) {
          try {
            unlinkSync(resolve(item.from));
            log.ok(`Deleted file ${item.from}`);
          }
          catch (ex) {
            failed.push(item.from);
            log.error(`Delete of ${item.form} failed: ${ex.message}`);
          }
        }

        else {
          try {
            copySync(resolve(item.to), resolve(item.from));
            log.ok(`Restored file ${item.to} to ${item.from}`);
          }
          catch (ex) {
            failed.push(item.to);
            log.error(`Restore of ${item.to} to ${item.from} failed: ${ex.message}`);
          }
        }

      });

      if (failed.length) {
        log.error(`Restore point ${id} could NOT be fully restored, try again or purge the restore point`);
      }
      else {
        delete backups[id];
        saveBackups(backups);
        log.ok(`Successfully restored ${id}`);
      }

    }

  });

}

/**
 * Writes content to file system.
 * 
 * @param {string} path the path to output file to.
 * @param {string} content the content of the file.
 * @param {function} fn a callback function when not synchronous.
 */
function writeToFile(path, content, fn) {
  const parsed = parse(path);
  ensureDirSync(parsed.dir);
  if (!fn)
    return writeFileSync(path, content, { encoding: 'utf8' });
  writeFile(path, content, { encoding: 'utf8' }, fn);
}

/**
 * Synchronizes config with blueprints then returns current config
 * optionally purges configs which do NOT have valid paths.
 * 
 * @param {boolean} purge when true purge generators from config.
 */
function syncConfig(purge) {
  config = config || {}; // may not be avail if haven't init yet.
  purge = typeof purge !== 'undefined' ? purge : config.allowPurge;
  syncGenerators(purge);
  return config;
}

module.exports = api;