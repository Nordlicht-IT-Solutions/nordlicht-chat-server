export function getEnv<T = any>(variable: string, dflt?: T) {
  if (variable in process.env) {
    return process.env[variable];
  }

  if (arguments.length >= 2) {
    return dflt;
  }

  throw new Error(`no such env variable defined: ${variable}`);
}
