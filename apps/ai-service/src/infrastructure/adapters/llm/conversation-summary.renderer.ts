export interface StructuredConversationSummary {
  currentGoal?: string;
  implemented?: string[];
  decisions?: string[];
  openIssues?: string[];
  nextSteps?: string[];
  constraints?: string[];
}

export function renderConversationSummary(
  summary: StructuredConversationSummary,
): string {
  const sections = [
    summary.currentGoal ? `Current goal: ${summary.currentGoal}` : undefined,
    renderList('Implemented', summary.implemented),
    renderList('Decisions', summary.decisions),
    renderList('Open issues', summary.openIssues),
    renderList('Next steps', summary.nextSteps),
    renderList('Constraints', summary.constraints),
  ].filter((section): section is string => Boolean(section));

  return sections.join('\n');
}

function renderList(label: string, values?: string[]): string | undefined {
  const items = values ?? [];

  if (items.length === 0) {
    return undefined;
  }

  return `${label}: ${items.join('; ')}`;
}
