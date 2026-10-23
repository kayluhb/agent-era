import { execFile } from 'node:child_process';

const RATE_LIMITED = /secondary rate limit|rate limit exceeded|HTTP 429/i;
const NOT_AUTHENTICATED = /auth login|not logged in|HTTP 401/i;

export class GhError extends Error {
  constructor(code, message, stderr = '') {
    super(message);
    this.name = 'GhError';
    this.code = code;
    this.stderr = stderr;
  }
}

function defaultExec(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      args,
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error?.code === 'ENOENT') return reject(error);
        resolve({ stdout, stderr, code: error ? (error.code ?? 1) : 0 });
      },
    );
  });
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createGh({
  exec = defaultExec,
  sleep = defaultSleep,
  maxRetries = 3,
  retryDelayMs = 60_000,
} = {}) {
  async function run(args) {
    for (let attempt = 0; ; attempt++) {
      let result;
      try {
        result = await exec(args);
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new GhError(
            'not_installed',
            'The GitHub CLI (gh) is not installed.',
          );
        }
        throw error;
      }
      if (result.code === 0) return JSON.parse(result.stdout);

      const { stderr } = result;
      if (RATE_LIMITED.test(stderr)) {
        if (attempt >= maxRetries) {
          throw new GhError(
            'rate_limited',
            'GitHub rate limit did not clear.',
            stderr,
          );
        }
        await sleep(retryDelayMs);
        continue;
      }
      if (NOT_AUTHENTICATED.test(stderr)) {
        throw new GhError(
          'not_authenticated',
          'The GitHub CLI is not logged in.',
          stderr,
        );
      }
      throw new GhError(
        'failed',
        `gh ${args.join(' ')} failed: ${stderr.trim()}`,
        stderr,
      );
    }
  }

  let user;
  const getUser = async () => {
    user ??= await run(['api', 'user']);
    return user;
  };

  return {
    graphql: async (query) =>
      (await run(['api', 'graphql', '-f', `query=${query}`])).data,
    rest: (path, params = {}) =>
      run([
        'api',
        '-X',
        'GET',
        path,
        ...Object.entries(params).flatMap(([key, value]) => [
          '-f',
          `${key}=${value}`,
        ]),
      ]),
    login: async () => (await getUser()).login,
    createdAt: async () => (await getUser()).created_at,
  };
}
