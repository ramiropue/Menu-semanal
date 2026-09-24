import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function getTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsxFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Automated Verification of Floating State Save Calls', () => {
  const targets = [
    'savePlannedMeals',
    'saveShoppingList',
    'saveFreezerItems',
    'saveFavorites',
  ];

  const dirsToScan = [
    path.resolve(__dirname, '../../app'),
    path.resolve(__dirname, '../../components'),
  ];

  it('ensures every consumer invocation of save functions is properly awaited and handled', () => {
    const files = dirsToScan.flatMap(getTsxFiles);
    let totalInvocationsFound = 0;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Ignorar líneas de importación o comentarios
        const trimmed = line.trim();
        if (trimmed.startsWith('import') || trimmed.startsWith('//') || trimmed.startsWith('*')) {
          return;
        }

        for (const target of targets) {
          // Detectar llamada a la función (e.g. savePlannedMeals(...) )
          const callPattern = new RegExp(`\\b${target}\\s*\\(`, 'g');
          if (callPattern.test(line)) {
            totalInvocationsFound++;

            // Debe estar precedida por 'await' o 'const result = await'
            const isAwaited = line.includes(`await ${target}`);
            const isHandled = line.includes('const result = await') || line.includes('const res = await');

            expect(
              isAwaited,
              `Floating promise detected in ${path.relative(process.cwd(), file)}:${index + 1}: "${line.trim()}". Must use 'await'.`
            ).toBe(true);

            expect(
              isHandled,
              `Unhandled result detected in ${path.relative(process.cwd(), file)}:${index + 1}: "${line.trim()}". Must capture and handle mutation result.`
            ).toBe(true);
          }
        }
      });
    }

    // Confirmar que se auditaron llamadas reales
    expect(totalInvocationsFound).toBeGreaterThanOrEqual(10);
  });
});
