import papi, { logger } from '@papi/backend';
import { ExecutionActivationContext, GetWebViewOptions, IWebViewProvider } from '@papi/core';
import { deserialize, isString, serialize } from 'platform-bible-utils';
import webViewContent from './verse-image-generator.web-view?inline';
import webViewContentStyle from './verse-image-generator.web-view.scss?inline';
import { getWebViewTitle } from './utils/utils';

/**
 * Get generated images from a server
 *
 * @param mirror Determines which server to use in case one is having issues
 * @param prompt Prompt to use to generate the image
 * @returns Array of image uris
 */
async function getImageUrls(mirror: number, prompt: string): Promise<string[]> {
  let imageUrls: string[] | undefined;

  try {
    if (mirror === 2) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      const responsesRaw = await Promise.all(
        Array.from(new Array(3)).map(() =>
          fetch('https://api.svg.io:10003/api/createimg/ai', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip, deflate, br',
              Connection: 'keep-alive',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: prompt.replace(/\r?\n/g, '').replace(/[^\w ]/g, ''),
            }),
          }),
        ),
      );
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
      try {
        const responses: { images: string[] }[] = (
          await Promise.all(responsesRaw.map((responseRaw) => responseRaw.text()))
        ).map((response) => JSON.parse(response));
        imageUrls = responses.flatMap((response) =>
          response.images.map((image) => `data:image/png;base64,${image}`),
        );
      } catch (e) {
        const message = `Error parsing svg.io image response into JSON: ${e}`;
        logger.error(message);
        throw new Error(message);
      }
    } else if (mirror === 1) {
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
        imageUrls = response.images.map((image) => `https://img.craiyon.com/${image}`);
      } catch (e) {
        const message = `Error parsing craiyon image response into JSON: ${e}`;
        logger.error(message);
        throw new Error(message);
      }
    } else {
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
      imageUrls = response.imgs;
    }
  } catch (e) {
    logger.error(`Error while retrieving image urls: ${e}`);
  }

  if (!imageUrls || !Array.isArray(imageUrls) || !imageUrls.every((url) => isString(url)))
    imageUrls = [];

  return imageUrls;
}

// Provider for the verse image generator webview
const webViewProvider: IWebViewProvider = {
  async getWebView(
    savedWebView,
    getWebViewOptions: GetWebViewOptions & { projectId: string | undefined },
  ) {
    const projectId = getWebViewOptions.projectId ?? savedWebView.projectId;
    const projectsMetadata = projectId
      ? await papi.projectLookup.getMetadataForProject(projectId)
      : undefined;
    return {
      title: getWebViewTitle(projectsMetadata?.name),
      ...savedWebView,
      content: webViewContent,
      styles: webViewContentStyle,
      projectId,
    };
  },
};

const webViewProviderType = 'verseImageGenerator.view';
const imageUrlsDataKey = 'imageUrls';

export async function activate(context: ExecutionActivationContext) {
  logger.info('Verse Image Generator is activating!');

  // Register the web view provider
  const webViewPromise = papi.webViewProviders.register(webViewProviderType, webViewProvider);

  // Pull up the web view
  const openPromise = papi.commands.registerCommand(
    'verseImageGenerator.open',
    async (projectId) => {
      const finalProjectId =
        projectId ??
        (await papi.dialogs.selectProject({ includeProjectTypes: 'ParatextStandard' }));
      // Add option as supported by the web view provider
      // eslint-disable-next-line no-type-assertion/no-type-assertion
      return papi.webViews.getWebView(webViewProviderType, undefined, {
        projectId: finalProjectId,
      } as GetWebViewOptions);
    },
  );

  // Set up a map of cached urls for each prompt
  const imageUrlsMap: Record<string, string[] | undefined> = {};

  /**
   * Save the image urls to extension storage so they persist between sessions
   *
   * @param prompt Prompt associated with current save (for error reporting only)
   */
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
    async (prompt, mirror = 0) => {
      if (!prompt) throw new Error('Must provide a prompt!');

      const cachedImageUrls = imageUrlsMap[prompt];
      if (cachedImageUrls) return cachedImageUrls;

      // Get array of image urls
      logger.log(`Requesting generated images from mirror ${mirror} for prompt ${prompt}`);
      const imageUrls = await getImageUrls(mirror, prompt);

      if (imageUrls.length > 0) imageUrlsMap[prompt] = imageUrls;

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

  // Set up registered extension features to be unregistered when deactivating the extension
  context.registrations.add(await webViewPromise, await generateImagesPromise, await openPromise);
}

export async function deactivate() {
  logger.info('Verse Image Generator is deactivating!');
  return true;
}
