/**
 * Get the name of the web view based on the name of the project
 *
 * @param projectName Should generally be the project's short name
 * @returns Web view title
 */
export function getWebViewTitle(projectName: string | undefined) {
  return `Verse Image Generator${projectName ? `: ${projectName}` : ''}`;
}
