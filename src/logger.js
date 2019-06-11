const { createLogger, format, transports } = require('winston');


function adjustLogger (logger, maxLogLevel) {
  logger.transports.forEach(transport => {
    transport.level = maxLogLevel;
  });
}

function getFormattedString (info, levels, timestamp) {
  let result = info.message;
  if (!levels && !timestamp) {
    return result;
  }
  result = ': ' + result;
  if (levels) {
    result = info.level + result;
  }
  if (timestamp) {
    result = info.timestamp + ' ' + result;
  }
  return result;
}

function initLogger ({
  colors = true,
  file = null,
  levels = true,
  maxLogLevel = 'info',
  timestamp = true
}) {
  const transforms = [
    format(info => {
      info.timestamp = new Date().toLocaleString();
      return info;
    })(),
    ...(colors ? [format.colorize()] : []),
    format.printf(info => getFormattedString(info, levels, timestamp))
  ];

  const transport = (typeof file === 'string') ? new transports.File({
    filename: file
  }) : new transports.Console();

  const logger = createLogger({
    format: format.combine(...transforms),
    transports: [
      transport
    ]
  });

  adjustLogger(logger, maxLogLevel);
  return logger;
}

module.exports = initLogger;
