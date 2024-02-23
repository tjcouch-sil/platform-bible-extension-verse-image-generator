import { logger } from '@papi/backend';

export async function activate() {
  logger.info('Verse Image Generator is activating!');
}

export async function deactivate() {
  logger.info('Verse Image Generator is deactivating!');
  return true;
}
