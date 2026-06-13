/**
 * Agnes AI provider plugin.
 *
 * Docs:
 * - Chat: https://agnes-ai.com/doc/agnes-20-flash
 * - Image: https://agnes-ai.com/doc/agnes-image-21-flash
 * - Video: https://agnes-ai.com/doc/agnes-video-v20
 */

/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const agnesPlugin = {
  id: "agnes",
  displayName: "Agnes AI",
  authType: "api-key",
  defaultBaseUrl: "https://apihub.agnes-ai.com/v1",
  defaultApi: "openai-completions",
  capabilities: {
    media: {
      imageGeneration: {
        defaultModelId: "agnes-image-2.1-flash",
        models: [
          {
            id: "agnes-image-2.1-flash",
            displayName: "Agnes Image 2.1 Flash",
            protocolId: "agnes-images",
            inputs: ["text", "image"],
            outputs: ["image"],
            supportsEdit: true,
          },
        ],
      },
      videoGeneration: {
        defaultModelId: "agnes-video-v2.0",
        models: [
          {
            id: "agnes-video-v2.0",
            displayName: "Agnes Video V2.0",
            protocolId: "agnes-videos",
            inputs: ["text", "image"],
            outputs: ["video"],
            supportsAsync: true,
          },
        ],
      },
    },
  },
};
