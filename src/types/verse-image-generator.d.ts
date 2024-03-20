declare module 'verse-image-generator' {
  // Add extension types exposed on the papi for other extensions to use here
  // More instructions can be found in the README
}

declare module 'papi-shared-types' {
  export interface CommandHandlers {
    /**
     * Generate images and return urls for them
     *
     * @param prompt Prompt for generating images
     * @param mirror Which server to use
     * @returns Array of urls for the generated images
     */
    'verseImageGenerator.generateImages': (prompt: string, mirror?: number) => Promise<string[]>;
    /**
     * Opens a verse image generator web view at the specified project id
     *
     * @param projectId
     * @returns Web view id for web view opened
     */
    'verseImageGenerator.open': (projectId?: string) => Promise<string | undefined>;
  }
}
