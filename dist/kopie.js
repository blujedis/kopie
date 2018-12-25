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
  readFileSync, ensureDirSync, readdirSync } = require('fs-extra');
const glob = require('fast-glob').sync;
const log = require('./logger')();

const { PKG, CWD, NAME, NAME_LOWER, KOPIE_PATH, BIN, PATHS, EXT } = require('./constants');
const hasOwn = (o, k) => o.hasOwnProperty(k);

let config, extExp;
let ext = EXT;

if (existsSync(PATHS.config)) {
  config = require(PATHS.config);
  ext = '.' + (config.ext || ext).replace(/^\./, '');
}

extExp = new RegExp(ext + '$');

const api = {
  PKG,
  NAME,
  NAME_LOWER,
  BIN,
  CWD,
  PATHS,
  log,
  init,
  aliasToKey,
  toNormalKey,
  fromNormalKey,
  extendConfig,
  config,
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
  render
};

/**
 * Generator config required.
 * 
 * @typedef {{ args: string[], options: string[], props: string[] }} GeneratorConfigRequired
 */

/**
* Generator config defaults.

* @typedef {{ args: string[], options: {}, props: {} }} GeneratorConfigDefaults
*/

/**
 * Generator config object.
 * 
 * @typedef {{ description: string, action: string, base: string, isDirectory: boolean, allowCopy: boolean, defaults: GeneratorConfigDefaults, required: GeneratorConfigRequired }} GeneratorConfig
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

  source = source || {};

  let srcDefs = source.defaults || {};
  let srcReqs = source.required || {};

  const targetDefs = { args: [], options: {}, props: {} };
  const targetReqs = { args: [], options: [], props: [] };

  srcDefs = { ...targetDefs, ...srcDefs };
  srcReqs = { ...targetReqs, ...srcReqs };

  return { ...target, ...source, ...{ defaults: srcDefs }, ...{ required: srcReqs } };

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

    if (purge && !conf.isStatic && (!existsSync(path) || invalidKey)) {

      let msg = `Removed generator "${key}" path does NOT exist`;

      if (invalidKey)
        msg = `Removed generator "${key}" unsuppored key name`;

      delete config.generators[key];

      removed.push({ key, conf, msg });

    }

    else {
      config.generators[key] = conf;
    }

  });

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

  if (!conf.isDirectory && !dest)
    dest = conf.name;

  if (!dest) return '';

  const parsed = parse(dest);

  if (!parsed.ext && !conf.isDirectory)
    dest = join(dest, conf.name);

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
 * @param {object} conf generator configuration object.
 * @param {string} dest the destination directory or file path.
 * 
 * @returns {{files: TemplateMapItem[], copyFiles: CopyMapItem[] }[]}
 */
function resolveTemplateMap(conf, dest) {

  dest = checkAbsolute(dest);

  const origDest = dest;
  const isAbsolute = /^\//.test(dest);
  const root = join(CWD, config.root);

  // Get resolved base route.
  dest = resolveDest(conf.base, dest);

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
 * 
 * @returns {boolean}
 */
function renderTemplate(template, dest, force) {

  const rel = relative(CWD, dest);

  // Check if path already exists.
  if (existsSync(dest) && !force) {
    log.warn(`Path ${rel} exists, use --force to overwrite`);
    return false;
  }

  try {
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
 * 
 * @returns {{ success: string[], failed: string[] }}
 */
function renderTemplates(templates, force) {

  const success = [];
  const failed = [];

  templates.forEach(m => {
    const rendered = renderTemplate(m.compiled, m.dest, force);
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
 * 
 * @returns {{ success: string[], failed: string[] }}
 */
function copyFile(src, dest, force) {

  const rel = relative(CWD, dest);

  // Check if path already exists.
  if (existsSync(dest) && !force) {
    log.warn(`Path ${rel} exists, use --force to overwrite`);
    return false;
  }

  try {
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
 * 
 * @returns {{ success: string[], failed: string[] }}
 */
function copyFiles(files, force) {

  const success = [];
  const failed = [];

  files.forEach(m => {
    const copied = copyFile(m.src, m.dest, force);
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
 * Verifies and prompts before render and write of templates.
 * 
 * @param {object} conf generator configuration object.
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

  // const files = conf.files.map(f => '  ' + relative(CWD, f)).join('\n');

  rl.question(`\nRender Preview (${conf.name})\n${list}\nAre you sure (y/N)? `, (answer) => {

    answer = (answer || '').trim().slice(0).toLowerCase();

    rl.close();

    // If yes render the templates.
    if (answer === 'y') {

      log();

      // Read and compile the templates.
      const compiled = compileTemplates(renderMap.files, args.props);

      // Render the templates return success/fail result.
      const result = renderTemplates(compiled, args.force);

      const copied = copyFiles(renderMap.copyFiles, args.force).success.length;

      let method = result.success.length > result.failed.length ? 'ok' : 'warn';
      method = !result.success.length ? 'error' : method;

      log[method](`Render finished - ${result.success.length} successful ${result.failed.length} failed ${copied} copied`);

      log();
      done();

    }
    else {
      log();
      done();
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