import { WebViewProps } from '@papi/core';
import papi from '@papi/frontend';
import { useProjectData, useSetting } from '@papi/frontend/react';
import { VerseRef } from '@sillsdev/scripture';
import { Button, ScriptureReference, usePromise } from 'platform-bible-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

/** Stable default ScriptureReference */
const defaultScrRef: ScriptureReference = { bookNum: 1, chapterNum: 1, verseNum: 1 };

global.webViewComponent = function VerseImageGenerator({
  useWebViewState,
  updateWebViewDefinition,
}: WebViewProps) {
  // Get the first project id we can find
  const [projects] = usePromise(
    useCallback(async () => {
      const metadata = await papi.projectLookup.getMetadataForAllProjects();
      const scriptureProjects = metadata.filter(
        (projectMetadata) => projectMetadata.projectType === 'ParatextStandard',
      );
      return scriptureProjects;
    }, []),
    undefined,
  );

  const [projectId, setProjectIdInternal] = useWebViewState<string | undefined>(
    'projectId',
    undefined,
  );
  const setProjectId = useCallback(
    (pId: string) => {
      setProjectIdInternal(pId);
      const projectName = projects?.find((project) => project.id === pId)?.name;
      if (projectName)
        updateWebViewDefinition({
          title: getWebViewTitle(projectName),
        });
    },
    [setProjectIdInternal, updateWebViewDefinition, projects],
  );

  // Get current verse reference
  const [scrRef] = useSetting('platform.verseRef', defaultScrRef);
  // Transform ScriptureReference to VerseRef for project data
  const verseRef = useMemo(
    () => new VerseRef(scrRef.bookNum, scrRef.chapterNum, scrRef.verseNum, undefined),
    [scrRef],
  );

  // Get the current verse from the project
  const [verse] = useProjectData('ParatextStandard', projectId).VerseUSFM(verseRef, '');

  const [prompt, setPrompt] = useWebViewState('prompt', '');
  const [images, setImages] = useWebViewState<string[]>('images', []);
  const [isLoading, setIsLoading] = useState(false);

  // When the current verse changes, update the prompt
  useEffect(() => {
    if (verse) setPrompt(stripUSFM(verse));
  }, [verse, setPrompt]);

  const [mirror, setMirror] = useWebViewState('mirror', 0);

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
    <div className="top">
      <div>
        Selected Scripture Project:{' '}
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects?.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        Selected Server Mirror:{' '}
        <select
          value={mirror}
          onChange={(e) => {
            setMirror(parseInt(e.target.value, 10));
          }}
        >
          {mirrorOptions?.map((mirrorOption, i) => (
            <option key={mirrorOption} value={i}>
              {mirrorOption}
            </option>
          ))}
        </select>
      </div>
      <div>Please enter a prompt for which to generate an image:</div>
      <div className="disclaimer">
        [WARNING: We do not control the image generation server. It may produce inaccurate or
        unexpected results.]
      </div>
      <div>
        <textarea className="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      <div>
        <Button onClick={requestImages}>Generate Images</Button>
      </div>
      {isLoading && <div>Loading images!</div>}
      <div className="img-grid">
        {images?.map((image) => (
          <div className="gen-img-container" key={image}>
            <button type="button" onClick={() => updateWebViewDefinition({ iconUrl: image })}>
              <img className="gen-img" src={image} alt={image} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
