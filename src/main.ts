import papi, { logger } from '@papi/backend';
import { ExecutionActivationContext, IWebViewProvider } from '@papi/core';
import { deserialize, serialize } from 'platform-bible-utils';
import webViewContent from './verse-image-generator.web-view?inline';
import webViewContentStyle from './verse-image-generator.web-view.scss?inline';

async function getImageUrls(mirror: number, prompt: string): Promise<string[]> {
  if (mirror === 1) {
    const responseRaw = await fetch('https://api.craiyon.com/v3', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        version: 'c4ue22fb7kb6wlac',
        // Using an external api
        // eslint-disable-next-line no-null/no-null
        token: null,
        model: 'art',
        negative_prompt: '',
      }),
    });
    try {
      const response: { images: string[] } = await responseRaw.json();
      return response.images.map((image) => `https://img.craiyon.com/${image}`);
    } catch (e) {
      const message = `Error parsing craiyon image response into JSON: ${e}`;
      logger.error(message);
      throw new Error(message);
    }
  }

  // Mirror 0 (default)
  const responseRaw = await fetch('https://chat-gpt.pictures/api/generateImage', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ captionInput: prompt, captionModel: 'default' }),
  });
  const response: { imgs: string[] } = await responseRaw.json();
  return response.imgs;
}

// Provider for the verse image generator webview
const webViewProvider: IWebViewProvider = {
  async getWebView(savedWebView) {
    return {
      ...savedWebView,
      content: webViewContent,
      styles: webViewContentStyle,
      title: 'Verse Image Generator',
    };
  },
};

const webViewProviderType = 'verseImageGenerator.view';
const imageUrlsDataKey = 'imageUrls';

export async function activate(context: ExecutionActivationContext) {
  logger.info('Verse Image Generator is activating!');

  // Register the web view provider
  const webViewPromise = papi.webViewProviders.register(webViewProviderType, webViewProvider);

  // Pull up the web view on startup
  papi.webViews.getWebView(webViewProviderType, undefined, { existingId: '?' });

  // Set up a map of cached urls for each prompt
  const imageUrlsMap: Record<string, string[] | undefined> = {};

  async function saveImageUrls(prompt: string) {
    try {
      await papi.storage.writeUserData(
        context.executionToken,
        imageUrlsDataKey,
        serialize(imageUrlsMap),
      );
    } catch (e) {
      logger.warn(`Saving Generated Image Urls for prompt '${prompt}' failed! ${e}`);
    }
  }

  // Register command to generate images for a prompt
  const generateImagesPromise = papi.commands.registerCommand(
    'verseImageGenerator.generateImages',
    async (prompt) => {
      if (!prompt) throw new Error('Must provide a prompt!');

      const cachedImageUrls = imageUrlsMap[prompt];
      if (cachedImageUrls) return cachedImageUrls;

      // Get array of image urls
      logger.log(`Requesting generated images for prompt ${prompt}`);
      const imageUrls = await getImageUrls(1, prompt);
      imageUrlsMap[prompt] = imageUrls;

      // Save the image urls but do not await so we just send them to the frontend
      saveImageUrls(prompt);

      return imageUrls;
    },
  );

  // Update current urls with stored urls
  try {
    const imagesFromStorage: Record<string, string[] | undefined> = deserialize(
      await papi.storage.readUserData(context.executionToken, imageUrlsDataKey),
    );
    Object.entries(imagesFromStorage).forEach(([pr, urls]) => {
      if (!imageUrlsMap[pr]) imageUrlsMap[pr] = urls;
    });
  } catch (e) {
    logger.warn(`Could not load image url cache. ${e}`);
  }

  context.registrations.add(await webViewPromise, await generateImagesPromise);
}

export async function deactivate() {
  logger.info('Verse Image Generator is deactivating!');
  return true;
}
