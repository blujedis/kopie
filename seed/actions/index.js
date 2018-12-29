

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

    // When prop.name is required use last segment
    // in path when no default is provided.
    args = kopie.pathToPropName(conf, args);

    kopie.render(conf, args, dest);

  }

  function advancedAction(conf, args) {

    // Determine our destination.
    let dest = kopie.normalizeDest(conf, args._[0]);

    // When prop.name is required use last segment
    // in path when no default is provided.
    args = kopie.pathToPropName(conf, args);

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
    advanced: advancedAction,
    noop
  };


};