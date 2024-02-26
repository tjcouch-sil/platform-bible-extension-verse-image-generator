import { WebViewProps } from '@papi/core';
import papi from '@papi/frontend';
import { useProjectData, useSetting } from '@papi/frontend/react';
import { VerseRef } from '@sillsdev/scripture';
import { Button, ScriptureReference, usePromise } from 'platform-bible-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Strips USFM markers out and such to transform USFM into plain text
 *
 * WARNING: This is not guaranteed to work perfectly. It's just a quick estimation for demonstration
 *
 * @param usfm USFM string
 * @returns Plain text string
 */
function stripUSFM(usfm: string) {
  return usfm
    .replace(/\\x .*\\x\*/g, '')
    .replace(/\\fig .*\\fig\*/g, '')
    .replace(/\\f .*\\f\*/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\\p\s+/g, '\n  ')
    .replace(/\\(?:id|h|toc\d|mt\d|c|ms\d|mr|s\d|q\d*)\s+/g, '\n')
    .replace(/\\\S+\s+/g, '')
    .trim();
}

/** Stable default ScriptureReference */
const defaultScrRef: ScriptureReference = { bookNum: 1, chapterNum: 1, verseNum: 1 };

global.webViewComponent = function VerseImageGenerator({ useWebViewState }: WebViewProps) {
  // Get the first project id we can find
  const [projectId] = usePromise(
    useCallback(async () => {
      const metadata = await papi.projectLookup.getMetadataForAllProjects();
      const projectMeta = metadata.find(
        (projectMetadata) => projectMetadata.projectType === 'ParatextStandard',
      );
      return projectMeta?.id;
    }, []),
    undefined,
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

  const requestImages = useCallback(async () => {
    setIsLoading(true);
    const uris = await papi.commands.sendCommand('verseImageGenerator.generateImages', prompt);
    setImages(uris);
    setIsLoading(false);
  }, [prompt, setImages]);

  return (
    <div className="top">
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
        {images.map((image) => (
          <div className="gen-img-container">
            <img className="gen-img" key={image} src={image} alt={image} />
          </div>
        ))}
      </div>
    </div>
  );
};
