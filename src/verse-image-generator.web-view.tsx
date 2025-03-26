import { WebViewProps } from '@papi/core';
import papi from '@papi/frontend';
import { useProjectData } from '@papi/frontend/react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  usePromise,
} from 'platform-bible-react';
import { useCallback, useEffect, useState } from 'react';
import { getWebViewTitle } from './utils/utils';

/**
 * Strips USFM markers out and such to transform USFM into plain text
 *
 * WARNING: This is not guaranteed to work perfectly. It's just a quick estimation for demonstration
 *
 * @param usfm USFM string
 * @returns Plain text string
 */
function stripUSFM(usfm: string) {
  return (
    usfm
      .replace(/\\x .*\\x\*/g, '')
      .replace(/\\fig .*\\fig\*/g, '')
      .replace(/\\f .*\\f\*/g, '')
      .replace(/\r?\n/g, ' ')
      .replace(/\\p\s+/g, '\n  ')
      .replace(/\\(?:id|h|toc\d|mt\d|c|ms\d|mr|s\d|q\d*)\s+/g, '\n')
      .replace(/\\\S+\s+/g, '')
      .trim()
      // Remove verse number at the start
      .replace(/\d+ /, '')
  );
}

const mirrorOptions = ['ChatGPT Images', 'Craiyon', 'SVG Icon'];

global.webViewComponent = function VerseImageGenerator({
  projectId,
  title,
  useWebViewState,
  updateWebViewDefinition,
  useWebViewScrollGroupScrRef,
}: WebViewProps) {
  const [projects] = usePromise(
    useCallback(async () => {
      const projectsMetadata = await papi.projectLookup.getMetadataForAllProjects({
        includeProjectInterfaces: 'platformScripture.USFM_Verse',
      });

      // Get project names
      const projectsMetadataDisplay = await Promise.all(
        projectsMetadata.map(async (projectMetadata) => {
          const pdp = await papi.projectDataProviders.get('platform.base', projectMetadata.id);

          const name = await pdp.getSetting('platform.name');

          return { ...projectMetadata, name };
        }),
      );
      return projectsMetadataDisplay;
    }, []),
    undefined,
  );

  const setProjectId = useCallback(
    (pId: string) => {
      const projectName = projects?.find((project) => project.id === pId)?.name;
      updateWebViewDefinition({
        title: projectName ? getWebViewTitle(projectName) : title,
        projectId: pId,
      });
    },
    [updateWebViewDefinition, projects, title],
  );

  // Get current verse reference
  const [verseRef] = useWebViewScrollGroupScrRef();

  // Get the current verse from the project
  const [verse] = useProjectData('platformScripture.USFM_Verse', projectId).VerseUSFM(verseRef, '');

  const [prompt, setPrompt] = useWebViewState('prompt', '');
  const [images, setImages] = useWebViewState<string[]>('images', []);
  const [isLoading, setIsLoading] = useState(false);

  // When the current verse changes, update the prompt
  useEffect(() => {
    if (verse) setPrompt(stripUSFM(verse));
  }, [verse, setPrompt]);

  const [mirror, setMirror] = useWebViewState('mirror', 1);

  const requestImages = useCallback(async () => {
    setIsLoading(true);
    const uris = await papi.commands.sendCommand(
      'verseImageGenerator.generateImages',
      prompt,
      mirror,
    );
    setImages(uris);
    setIsLoading(false);
  }, [prompt, setImages, mirror]);

  return (
    <div className="[&>div]:tw-mb-2 tw-m-2">
      <div>
        Selected Scripture Project:{' '}
        <Select value={projectId} onValueChange={(pId) => setProjectId(pId)}>
          <SelectTrigger className="tw-w-auto tw-inline-flex">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects?.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        Selected Server Mirror:{' '}
        <Select
          value={`${mirror}`}
          onValueChange={(selectedMirror) => {
            setMirror(parseInt(selectedMirror, 10));
          }}
        >
          <SelectTrigger className="tw-w-auto tw-inline-flex">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {mirrorOptions?.map((mirrorOption, i) => (
              <SelectItem key={mirrorOption} value={`${i}`}>
                {mirrorOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>Please enter a prompt for which to generate an image:</div>
      <div className="tw-italic tw-text-muted-foreground">
        [WARNING: We do not control the image generation server. It may produce inaccurate or
        unexpected results.]
      </div>
      <div>
        <textarea
          className="tw-w-full tw-h-20 tw-p-1 tw-outline tw-outline-1 tw-outline-foreground tw-bg-background"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>
      <div>
        <Button onClick={requestImages}>Generate Images</Button>
      </div>
      {isLoading && <div>Loading images!</div>}
      <div className="tw-flex tw-flex-wrap tw-gap-1">
        {images?.map((image) => (
          <div className="tw-flex-grow tw-flex-shrink-0 tw-basis-19" key={image}>
            <button type="button" onClick={() => updateWebViewDefinition({ iconUrl: image })}>
              <img className="tw-max-h-full tw-max-w-full" src={image} alt={image} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
