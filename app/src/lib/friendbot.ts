const FRIEND_BOT_URL = "https://friendbot.stellar.org";
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

export const FRIEND_BOT_RATE_LIMIT_MESSAGE =
  "Stellar's test-money faucet is rate-limiting; wait ~a minute and retry.";

export class FriendbotRetryableError extends Error {
  readonly status?: number;

  constructor(status?: number) {
    super(FRIEND_BOT_RATE_LIMIT_MESSAGE);
    this.name = "FriendbotRetryableError";
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function backoffWithJitterMs(attempt: number): number {
  const exponential = BASE_DELAY_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return exponential + jitter;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

export async function friendbotFund(publicKey: string): Promise<void> {
  const url = `${FRIEND_BOT_URL}?addr=${publicKey}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);

      if (res.ok || res.status === 400) {
        return;
      }

      if (isRetryableStatus(res.status)) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffWithJitterMs(attempt));
          continue;
        }
        throw new FriendbotRetryableError(res.status);
      }

      throw new Error(`friendbot funding failed: ${res.status}`);
    } catch (error) {
      if (isNetworkFailure(error)) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffWithJitterMs(attempt));
          continue;
        }
        throw new FriendbotRetryableError();
      }

      throw error;
    }
  }
}
