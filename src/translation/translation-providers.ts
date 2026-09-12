import { GEMINI_TRANSLATION_PROVIDER } from "./gemini-translation";
import { OPENAI_TRANSLATION_PROVIDER } from "./openai-translation";
import type {
  TranslationProvider,
  TranslationProviderId,
  TranslationProviderInfo,
} from "./translation-provider";

export const DEFAULT_TRANSLATION_PROVIDER_ID: TranslationProviderId = "gemini";

export const TRANSLATION_PROVIDERS: readonly TranslationProvider[] = [
  GEMINI_TRANSLATION_PROVIDER,
  OPENAI_TRANSLATION_PROVIDER,
];

export const TRANSLATION_PROVIDER_INFO: readonly TranslationProviderInfo[] =
  TRANSLATION_PROVIDERS.map(
    ({ id, displayName, defaultModelId, models, apiKeyPlaceholder, apiKeyUrl }) => ({
      id,
      displayName,
      defaultModelId,
      models,
      apiKeyPlaceholder,
      apiKeyUrl,
    }),
  );

export function translationProvider(providerId: TranslationProviderId): TranslationProvider {
  const provider = TRANSLATION_PROVIDERS.find(({ id }) => id === providerId);
  if (!provider) throw new Error(`Unknown translation provider: ${providerId}`);
  return provider;
}

export function translationModel(
  provider: TranslationProvider,
  modelId: string,
): TranslationProvider["models"][number] {
  const model = provider.models.find(({ id }) => id === modelId);
  if (!model) throw new Error(`Unknown ${provider.displayName} translation model: ${modelId}`);
  return model;
}
