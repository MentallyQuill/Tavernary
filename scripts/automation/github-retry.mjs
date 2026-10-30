const sleepDefault = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const retryDelaysMs = [2000, 5000];

export async function retryGithubRequest(request, options) {
  const sleep = options.sleep ?? sleepDefault;
  const reportRetry =
    options.reportRetry ?? ((value) => console.error(JSON.stringify(value)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= retryDelaysMs.length || !options.retryable(error))
        throw error;
      const delayMs = retryDelaysMs[attempt];
      reportRetry({
        event: "github-request-retry",
        attempt: attempt + 2,
        delay_ms: delayMs,
      });
      await sleep(delayMs);
    }
  }
}
