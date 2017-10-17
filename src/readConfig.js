const { readFileSync } = require('fs');
const { merge } = require('lodash');


module.exports = function (filenames, logger) {
  const configs = filenames
    .map(filename =>loadAndParseFile(filename, logger))
    .filter(string => string !== null);

  if (!configs.length) {
    throw new Error(`Failed to read each of these config files: ${filenames.join(', ')}`);
  }

  return merge(configs[0], ...configs.slice(1));
};

function loadAndParseFile (filename, logger) {
  let string;
  try {
    string = readFileSync(filename, 'utf8');
  } catch (error) {
    logger.warn(`Warning: can't read config file ${filename}. ${error.message}`);
    return null;
  }

  try {
    return JSON.parse(string);
  } catch (error) {
    throw new Error(`Failed to parse config file ${filename}. ${error.message}`);
  }
}
