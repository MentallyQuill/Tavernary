export function retryGithubRequest<T>(
  request: () => Promise<T>,
  options: {
    retryable: (error: unknown) => boolean;
    sleep?: (milliseconds: number) => Promise<unknown>;
    reportRetry?: (value: {
      event: "github-request-retry";
      attempt: number;
      delay_ms: number;
    }) => void;
  },
): Promise<T>;
