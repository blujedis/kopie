

module.exports = function (kopie) {

  ///////////////////////////////////////////
  // HELPERS
  const config = kopie.config;
  const log = kopie.log;
  const noop = (conf => log.info(`Generator "${conf.name}" set to no operation action`));
  ///////////////////////////////////////////

  function defaultAction(conf, args) {

    // Determine our destination.
    let dest = kopie.normalizeDest(conf, args._[0]);

    kopie.render(conf, args, dest);

  }

  function advancedAction(conf, args) {

    // Determine our destination.
    let dest = kopie.normalizeDest(conf, args._[0]);

    // Validate the generator.
    const validator = kopie.validateGenerator(conf, args);

    // (validator, false) to prevent exit on fail.
    if (validator.invalid)
      log.validator(validator);

    // Resolve the base destiniation
    const renderMap = kopie.resolveTemplateMap(conf, dest);

    // Compile the templates.
    const compiled = kopie.compileTemplates(renderMap.files, args.props);

    // Render each template returns report.
    const result = kopie.renderTemplates(compiled);

    const copied = kopie.copyFiles(renderMap.copyFiles, args.force).success.length;

    // Do something with results.
    log(`Render finished - ${result.success.length} successful ${result.failed.length} failed ${copied} copied`);

  }

  return {
    default: defaultAction,
    noop
  };


};