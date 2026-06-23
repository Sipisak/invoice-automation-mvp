// ponytail: console logger; swap for App Insights / context.log in prod.
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: unknown): void {
  const line = `[${level}] ${msg}`;
  if (level === 'error') console.error(line, meta ?? '');
  else if (level === 'warn') console.warn(line, meta ?? '');
  else console.log(line, meta ?? '');
}

export const logger = {
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};
