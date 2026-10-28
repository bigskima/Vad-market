import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const migrationRoot = resolve('supabase/migrations');

async function collectSqlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectSqlFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.sql')
      ? [fullPath]
      : [];
  }));
  return nested.flat();
}

const files = await collectSqlFiles(migrationRoot);
const issues = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    // A line containing "$;" or "$tag;" is not a valid dollar-quote
    // terminator. PostgreSQL function bodies need a matching tag such as
    // "$$;" or "$tag$;".
    if (/^\s*as\s+\$(?:\s*--.*)?$/.test(line)) {
      issues.push(
        `${relative(process.cwd(), file)}:${index + 1}: malformed dollar-quote opener; use a valid tag such as $$`,
      );
    }

    if (/^\s*\$(?:[A-Za-z_][A-Za-z0-9_]*)?;\s*(?:--.*)?$/.test(line)) {
      issues.push(
        `${relative(process.cwd(), file)}:${index + 1}: malformed dollar-quote terminator; use the matching closing tag (for example, $;)`,
      );
    }

    if (/^\\s*\\$(?:[A-Za-z_][A-Za-z0-9_]*)?\\$\\s*$/.test(line)) {
      let next = index + 1;
      while (next < lines.length && (lines[next].trim() === '' || lines[next].trim().startsWith('--'))) {
        next += 1;
      }
      if (next >= lines.length || !lines[next].trim().startsWith(';')) {
        issues.push(
          `${relative(process.cwd(), file)}:${index + 1}: dollar-quote terminator is missing its semicolon`,
        );
      }
    }
  });
}

if (issues.length > 0) {
  console.error('SQL migration terminator guard failed:');
  for (const issue of issues) console.error(` - ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`SQL migration terminator guard passed for ${files.length} migration file(s).`);
}
