import type { ExtensionMessage, ExtensionResponse } from './types';

export async function sendExtensionMessage<T>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as ExtensionResponse<T>;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'The extension service is unavailable.',
      },
    };
  }
}
