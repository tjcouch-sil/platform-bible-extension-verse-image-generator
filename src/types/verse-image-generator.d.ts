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
     * @returns Array of urls for the generated images
     */
    'verseImageGenerator.generateImages': (prompt: string) => Promise<string[]>;
  }
}
