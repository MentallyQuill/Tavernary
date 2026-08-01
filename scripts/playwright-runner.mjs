const HEALTH_TIMEOUT_MS = 2_000;

function boundedSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function serverResponds(
  url,
  { fetchImpl = fetch, signal, timeoutMs = HEALTH_TIMEOUT_MS } = {},
) {
  try {
    await fetchImpl(url, { signal: boundedSignal(signal, timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

export async function fetchBounded(
  url,
  { fetchImpl = fetch, signal, timeoutMs = HEALTH_TIMEOUT_MS } = {},
) {
  return fetchImpl(url, { signal: boundedSignal(signal, timeoutMs) });
}

export async function cleanupFixture(
  fixture,
  { hasPrimaryFailure, logError = console.error } = {},
) {
  if (!fixture) return;
  try {
    await fixture.cleanup();
  } catch (cleanupError) {
    if (hasPrimaryFailure) {
      logError("Failed to remove TavernKeeper fixture", cleanupError);
      return;
    }
    throw cleanupError;
  }
}
