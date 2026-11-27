import { execFileSync } from 'child_process';
import { resolve } from 'path';

describe('Restock batch database regression', () => {
  it('runs production restock/undo SQL with real rollback and activity conflicts', () => {
    const output = execFileSync(process.execPath, [resolve(__dirname, '../../../scripts/test-restock-batches.cjs')],
      { encoding: 'utf8', timeout: 45000 });
    expect(output).toContain('PASS: production restock/undo SQL');
  }, 50000);
});
