import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const files = [
  ...sources('cloudfunctions/business-api/src'),
  ...sources('packages/backend/src'),
  ...sources('packages/contracts/src'),
];

// DevTools may check backend source without the repository's Bundler settings.
// Test the actual local imports, rather than suppressing editor diagnostics.
it.each([
  ['Classic', ts.ModuleResolutionKind.Classic],
  ['Node10', ts.ModuleResolutionKind.Node10],
  ['Bundler', ts.ModuleResolutionKind.Bundler],
] as const)('backend relative imports resolve with %s module resolution', (_name, moduleResolution) => {
  const failures: string[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
      const result = ts.resolveModuleName(specifier.text, resolve(file), {
        module: ts.ModuleKind.ESNext,
        moduleResolution,
      }, ts.sys);
      if (!result.resolvedModule) failures.push(`${file}: ${specifier.text}`);
    }
  }
  expect(failures).toEqual([]);
});
