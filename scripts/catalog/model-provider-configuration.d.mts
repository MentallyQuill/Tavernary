export type ModelProviderConfiguration = {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
};

export type ModelProviderOptions = ModelProviderConfiguration & {
  jsonRepair: ModelProviderConfiguration;
};

export function modelProviderOptionsFromEnvironment(
  environment?: Record<string, string | undefined>,
): ModelProviderOptions;
