import { expect } from 'chai';
import { Position, Range } from 'vscode';
import { findQuotedIdentifierRange } from '../../../debug/cqlEvaluatableExpressionProvider';

suite('findQuotedIdentifierRange', () => {
  const line = 5;
  const lineText = '  "Denominator Exceptions"  ';

  test('returns null when cursor is before the opening quote', () => {
    expect(findQuotedIdentifierRange(lineText, line, 0)).to.be.null;
    expect(findQuotedIdentifierRange(lineText, line, 1)).to.be.null;
  });

  test('returns full quoted range when cursor is on the opening quote', () => {
    const result = findQuotedIdentifierRange(lineText, line, 2);
    expect(result).to.deep.equal(
      new Range(new Position(line, 2), new Position(line, 26)),
    );
  });

  test('returns full quoted range when cursor is on a letter inside the string', () => {
    const result = findQuotedIdentifierRange(lineText, line, 5);
    expect(result).to.deep.equal(
      new Range(new Position(line, 2), new Position(line, 26)),
    );
  });

  test('returns full quoted range when cursor is on the closing quote', () => {
    const result = findQuotedIdentifierRange(lineText, line, 25);
    expect(result).to.deep.equal(
      new Range(new Position(line, 2), new Position(line, 26)),
    );
  });

  test('returns null when cursor is after the closing quote', () => {
    expect(findQuotedIdentifierRange(lineText, line, 26)).to.be.null;
    expect(findQuotedIdentifierRange(lineText, line, 27)).to.be.null;
  });

  test('handles first word of multi-word identifier', () => {
    const result = findQuotedIdentifierRange(lineText, line, 3);
    expect(result).to.deep.equal(
      new Range(new Position(line, 2), new Position(line, 26)),
    );
  });

  test('handles last word of multi-word identifier', () => {
    const result = findQuotedIdentifierRange(lineText, line, 24);
    expect(result).to.deep.equal(
      new Range(new Position(line, 2), new Position(line, 26)),
    );
  });

  test('handles single-word quoted identifier', () => {
    const text = '  "InitialPopulation"  ';
    const result = findQuotedIdentifierRange(text, line, 5);
    expect(result).to.deep.equal(
      new Range(new Position(line, 2), new Position(line, 21)),
    );
  });

  test('handles cursor on the opening quote of single-word identifier', () => {
    const text = '"InitialPopulation"';
    const result = findQuotedIdentifierRange(text, line, 0);
    expect(result).to.deep.equal(
      new Range(new Position(line, 0), new Position(line, 19)),
    );
  });

  test('handles cursor on the closing quote of single-word identifier', () => {
    const text = '"InitialPopulation"';
    const result = findQuotedIdentifierRange(text, line, 18);
    expect(result).to.deep.equal(
      new Range(new Position(line, 0), new Position(line, 19)),
    );
  });

  test('returns null when there are no quotes on line', () => {
    expect(findQuotedIdentifierRange('plain text', line, 2)).to.be.null;
  });

  test('handles multiple quoted strings (cursor in first)', () => {
    const text = '"First" and "Second"';
    const result = findQuotedIdentifierRange(text, line, 3);
    expect(result).to.deep.equal(
      new Range(new Position(line, 0), new Position(line, 7)),
    );
  });

  test('handles multiple quoted strings (cursor in second)', () => {
    const text = '"First" and "Second"';
    const result = findQuotedIdentifierRange(text, line, 18);
    expect(result).to.deep.equal(
      new Range(new Position(line, 12), new Position(line, 20)),
    );
  });

  test('handles unclosed quote at end of line', () => {
    const text = '"Unclosed';
    const result = findQuotedIdentifierRange(text, line, 5);
    expect(result).to.deep.equal(
      new Range(new Position(line, 0), new Position(line, 9)),
    );
  });
});
