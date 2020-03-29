import winston from 'winston'
import morgan from 'morgan'

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf((info) => `${info.timestamp} [${info.level}]: ${info.message} ${info.stack || ''}`),
  ),
  transports: [
    new winston.transports.Console(),
  ],
})

logger.stream = {
  // eslint-disable-next-line
  write: function(message, encoding) {
    // use the 'info' log level so the output will be picked up by both transports
    logger.info(message)
  }
}

logger.middleware = morgan('combined', { stream: logger.stream })

export default logger
