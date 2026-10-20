/** Split SQL without treating quoted semicolons as statement separators. */
export function splitStatements(input: string): string[] {
  const result: string[] = [];
  let quote = ''; let buffer = ''; let lineComment = false; let blockComment = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!; const next = input[i + 1];
    if (lineComment) { if (ch === '\n') { lineComment = false; buffer += '\n'; } continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; buffer += ' '; } continue; }
    if (quote) {
      buffer += ch;
      if (ch === '\\' && next) { buffer += next; i++; }
      else if (ch === quote) { if (next === quote) { buffer += next; i++; } else quote = ''; }
      continue;
    }
    if (ch === '-' && next === '-' && /\s/.test(input[i + 2] ?? ' ')) { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    if (ch === ';') { if (buffer.trim()) result.push(buffer.trim()); buffer = ''; }
    else buffer += ch;
  }
  if (quote || blockComment) throw new Error('Unterminated SQL string or comment');
  if (buffer.trim()) result.push(buffer.trim());
  return result;
}

export function initialTableNames(sql: string): string[] {
  return splitStatements(sql).map(statement => {
    const name = /^CREATE TABLE\s+([a-z_]+)\s*\(/.exec(statement)?.[1];
    if (!name) throw new Error('Initial migration must contain only explicit CREATE TABLE statements');
    return name;
  });
}
