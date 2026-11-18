import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

const schema = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../schemas/cql-config.schema.json'),
    'utf-8',
  ),
);

function findValueDescription(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  const props = obj['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (props?.['value'] && props['name'] && props['type']) {
    return props['value']['description'] as string;
  }
  for (const child of Object.values(obj)) {
    const found = findValueDescription(child);
    if (found) {
      return found;
    }
  }
  return undefined;
}

suite('cql-config.schema.json parameter value', () => {
  // The language server compiles each value as a CQL expression, so an unquoted
  // String (HMO) is an identifier and drops every parameter for the run (#198).
  const description = findValueDescription(schema);

  test('the parameter value has a description', () => {
    expect(description).to.be.a('string');
  });

  test('the String example is a single-quoted CQL literal', () => {
    expect(description).to.include(`"'HMO'"`);
  });

  test('no unquoted String example is recommended', () => {
    expect(description).not.to.include('"HMO"');
  });
});
