export type PolicyBlock = {
  kind: 'paragraph' | 'subheading' | 'bullet';
  text: string;
};

export type PolicySection = {
  title: string;
  blocks: PolicyBlock[];
};

export type PolicyInlineSegment = {
  text: string;
  bold: boolean;
};

export function parsePolicySections(content: string, summary = ''): PolicySection[] {
  const normalized = content.replaceAll('\r', '').trim();
  if (!normalized) {
    return [{
      title: 'Overview',
      blocks: summary ? [{ kind: 'paragraph', text: summary }] : [],
    }];
  }

  const lines = normalized.split('\n');
  const sections: PolicySection[] = [];
  let current: PolicySection = { title: 'Overview', blocks: [] };

  function pushCurrent() {
    if (current.blocks.length || current.title !== 'Overview') sections.push(current);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionTitle = sectionHeading(line);
    if (sectionTitle) {
      pushCurrent();
      current = { title: sectionTitle, blocks: [] };
      continue;
    }

    const subheading = subheadingText(line);
    if (subheading) {
      current.blocks.push({ kind: 'subheading', text: subheading });
      continue;
    }

    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet?.[1]) {
      current.blocks.push({ kind: 'bullet', text: cleanPolicyMarkup(bullet[1]) });
      continue;
    }

    current.blocks.push({ kind: 'paragraph', text: cleanPolicyMarkup(line) });
  }
  pushCurrent();

  if (!sections.length) {
    return [{ title: 'Overview', blocks: [{ kind: 'paragraph', text: cleanPolicyMarkup(normalized) }] }];
  }

  if (sections.length === 1 && sections[0].blocks.length > 6) {
    const blocks = sections[0].blocks;
    const chunks: PolicySection[] = [];
    for (let index = 0; index < blocks.length; index += 4) {
      chunks.push({
        title: index === 0 ? sections[0].title : `Continue reading · ${Math.floor(index / 4) + 1}`,
        blocks: blocks.slice(index, index + 4),
      });
    }
    return chunks;
  }

  return sections;
}

export function parseInlinePolicyText(text: string): PolicyInlineSegment[] {
  const segments: PolicyInlineSegment[] = [];
  const pattern = /(\*\*|__)(.+?)\1/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), bold: false });
    }
    segments.push({ text: match[2], bold: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), bold: false });
  }

  return segments.length ? segments : [{ text, bold: false }];
}

function sectionHeading(line: string) {
  const explicit = line.match(/^#\s+(.+)$/);
  if (explicit?.[1]) return cleanPolicyMarkup(explicit[1]);

  // Backward compatibility for legal versions published before explicit formatting controls existed.
  const numbered = line.match(/^((?:SECTION\s+)?\d+|[IVXLC]+)[.:)]\s+(.+)$/i);
  if (numbered?.[2] && line.length <= 140) return cleanPolicyMarkup(line);

  if (line.length <= 90 && line.endsWith(':') && line.split(/\s+/).length <= 10) {
    return cleanPolicyMarkup(line.slice(0, -1));
  }

  if (line.length <= 84 && /[A-Z]/.test(line) && line === line.toUpperCase() && line.split(/\s+/).length <= 10) {
    return cleanPolicyMarkup(line);
  }

  return null;
}

function subheadingText(line: string) {
  const explicit = line.match(/^#{2,3}\s+(.+)$/);
  if (explicit?.[1]) return cleanPolicyMarkup(explicit[1]);

  const bold = line.match(/^\*\*(.+)\*\*$/);
  if (bold?.[1]) return cleanPolicyMarkup(bold[1]);

  const nested = line.match(/^\d+\.\d+(?:\.\d+)?[.)]?\s+(.+)$/);
  if (nested?.[1] && line.length <= 140) return cleanPolicyMarkup(line);

  return null;
}

function cleanPolicyMarkup(value: string) {
  return value
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .trim();
}
