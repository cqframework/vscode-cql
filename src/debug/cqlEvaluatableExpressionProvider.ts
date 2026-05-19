import * as vscode from 'vscode';

/**
 * Provides evaluatable expressions for CQL during debugging.
 *
 * VS Code sends `evaluate` requests with `context: "hover"` during a debug session.
 * The default expression extraction uses word boundaries, which breaks multi-word
 * CQL identifiers and dotted paths (`Patient.name` becomes just `Patient` or `name`).
 *
 * For define references (quoted identifiers like `"Patient Age 12..."`), the
 * expression sent is the identifier text so the DAP server can look it up by name.
 * For sub-expressions, the expression is `@line:col` so the DAP server matches by
 * source position.
 */
export class CqlEvaluatableExpressionProvider
  implements vscode.EvaluatableExpressionProvider
{
  provideEvaluatableExpression(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.EvaluatableExpression> {
    const lineNumber = position.line;
    const lineText = document.lineAt(lineNumber).text;
    const col = position.character;

    const quoted = findQuotedIdentifierRange(lineText, lineNumber, col);
    if (quoted) {
      return new vscode.EvaluatableExpression(
        quoted,
        extractQuotedText(lineText, quoted),
      );
    }

    const wordRange =
      document.getWordRangeAtPosition(position) ??
      new vscode.Range(position, position);
    return new vscode.EvaluatableExpression(
      wordRange,
      `@${position.line}:${position.character}`,
    );
  }
}

/**
 * Returns the text between the surrounding double quotes of a quoted-identifier
 * range. The range is assumed to start at `"` and end just past the closing `"`.
 */
function extractQuotedText(lineText: string, range: vscode.Range): string {
  const start = range.start.character + 1; // skip opening quote
  const end = range.end.character - 1; // skip closing quote
  return lineText.slice(start, end);
}

/**
 * If the cursor is within a double-quoted string on the line, returns a range
 * covering the full quoted text (including the quotes). Otherwise returns null.
 *
 * Boundary behavior:
 *   On opening "          → Returns full quoted range
 *   On letter inside str → Returns full quoted range
 *   On closing "           → Returns full quoted range
 *   Before opening "      → Returns null (falls through to word range)
 *   After closing "       → Returns null (falls through to word range)
 */
export function findQuotedIdentifierRange(
  lineText: string,
  lineNumber: number,
  col: number,
): vscode.Range | null {
  let openQuote = -1;
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '"') {
      if (openQuote === -1) {
        openQuote = i;
      } else {
        if (col >= openQuote && col <= i) {
          return new vscode.Range(
            new vscode.Position(lineNumber, openQuote),
            new vscode.Position(lineNumber, i + 1),
          );
        }
        openQuote = -1;
      }
    }
  }
  if (openQuote !== -1 && col >= openQuote) {
    return new vscode.Range(
      new vscode.Position(lineNumber, openQuote),
      new vscode.Position(lineNumber, lineText.length),
    );
  }
  return null;
}
