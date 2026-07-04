import chalk from 'chalk';
import moment from 'moment-timezone';

const labelColor = {
  info: chalk.cyan,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  debug: chalk.gray,
};

function now() {
  return moment.tz('Asia/Jakarta').format('HH:mm:ss');
}

export function log(level, scope, message, detail = '') {
  const color = labelColor[level] || labelColor.info;
  const head = `${chalk.gray(now())} ${color(level.toUpperCase().padEnd(7))} ${chalk.white(scope)}`;
  const suffix = detail ? ` ${chalk.gray(detail)}` : '';
  console.log(`${head} ${message}${suffix}`);
}

export const logger = {
  info: (scope, message, detail) => log('info', scope, message, detail),
  success: (scope, message, detail) => log('success', scope, message, detail),
  warn: (scope, message, detail) => log('warn', scope, message, detail),
  error: (scope, message, detail) => log('error', scope, message, detail),
  debug: (scope, message, detail) => log('debug', scope, message, detail),
};

export default logger;
