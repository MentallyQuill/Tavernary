export type ModelProviderConfiguration = {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
};

export type ModelProviderOptions = ModelProviderConfiguration & {
  requireBudget?: boolean;
  reasoningEffort?: string;
  jsonRepair: ModelProviderConfiguration;
};

export function modelProviderOptionsFromEnvironment(
  environment?: Record<string, string | undefined>,
): ModelProviderOptions;
