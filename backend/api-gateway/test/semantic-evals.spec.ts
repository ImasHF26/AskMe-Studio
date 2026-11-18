/**
 * semantic-evals.spec.ts
 *
 * Bridge Jest → runner d'évals sémantiques.
 * Lance le même script node scripts/run-api-gateway-evals.cjs
 * en tant que sous-processus et vérifie que la sortie finale
 * confirme 44/44 (ou N/N) passages.
 *
 * Ce fichier doit rester en dehors du répertoire dist/.
 */

import { execFileSync } from 'child_process';
import path from 'path';

describe('Semantic evals (run-api-gateway-evals)', () => {
  it('should pass all semantic evals', () => {
    const root = path.resolve(__dirname, '..', '..', '..'); // askme-studio-main
    const script = path.join(root, 'scripts', 'run-api-gateway-evals.cjs');

    let output = '';
    try {
      output = execFileSync(process.execPath, [script], {
        cwd: root,
        timeout: 60_000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      const combined = [execErr.stdout, execErr.stderr, execErr.message].filter(Boolean).join('\n');
      throw new Error(`Semantic evals process exited with error:\n${combined}`);
    }

    // Ligne finale attendue: "api-gateway semantic evals passed: N/N"
    const match = output.match(/api-gateway semantic evals passed:\s*(\d+)\/(\d+)/);
    expect(match).not.toBeNull();

    const passed = parseInt(match![1], 10);
    const total = parseInt(match![2], 10);

    expect(total).toBeGreaterThan(0);
    expect(passed).toBe(total);
  }, 90_000 /* timeout 90s for slow CI */);
});
