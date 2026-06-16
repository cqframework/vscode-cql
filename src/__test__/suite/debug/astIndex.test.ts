import { expect } from 'chai';
import { hasFullCoordinates } from '../../../utils/astIndex';

suite('hasFullCoordinates', () => {
  test('returns false when endLine === line && endColumn === column', () => {
    expect(hasFullCoordinates({ line: 5, column: 3, endLine: 5, endColumn: 3 })).to.be.false;
  });

  test('returns true when endColumn > column (single-line span)', () => {
    expect(hasFullCoordinates({ line: 5, column: 3, endLine: 5, endColumn: 10 })).to.be.true;
  });

  test('returns true when endLine > line (multi-line span)', () => {
    expect(hasFullCoordinates({ line: 5, column: 1, endLine: 7, endColumn: 5 })).to.be.true;
  });

  test('returns true when both endLine > line and endColumn > column', () => {
    expect(hasFullCoordinates({ line: 5, column: 3, endLine: 8, endColumn: 12 })).to.be.true;
  });
});
