import { expect } from 'chai';
import { sanitizeDescription } from '../../../model/testCase';

suite('sanitizeDescription', () => {
  test('passthrough for plain text', () => {
    expect(sanitizeDescription('Plain text')).to.equal('Plain text');
  });

  test('strips markdown bold and italic', () => {
    expect(sanitizeDescription('**bold** and _italic_')).to.equal('bold and italic');
  });

  test('replaces newline with space', () => {
    expect(sanitizeDescription('Line one\nLine two')).to.equal('Line one Line two');
  });

  test('replaces CRLF with space', () => {
    expect(sanitizeDescription('Line one\r\nLine two')).to.equal('Line one Line two');
  });

  test('collapses multiple spaces and trims', () => {
    expect(sanitizeDescription('  extra   spaces  ')).to.equal('extra spaces');
  });

  test('strips control characters', () => {
    expect(sanitizeDescription('Text\x00with\x1Fcontrol')).to.equal('Text with control');
  });

  test('empty string returns empty string', () => {
    expect(sanitizeDescription('')).to.equal('');
  });

  test('all-whitespace string returns empty string', () => {
    expect(sanitizeDescription('  ')).to.equal('');
  });
});
