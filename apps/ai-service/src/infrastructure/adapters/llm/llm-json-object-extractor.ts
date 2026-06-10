export function extractLlmJsonObjects(text: string): string[] {
  const stripped = stripMarkdownFence(text);
  const objects: string[] = [];

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < stripped.length; index += 1) {
    const char = stripped[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }

      depth += 1;
      continue;
    }

    if (char === '}' && depth > 0) {
      depth -= 1;

      if (depth === 0 && start !== -1) {
        objects.push(stripped.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  return objects;
}

function stripMarkdownFence(text: string): string {
  return text.replace(/```(?:json)?/gi, '').trim();
}
