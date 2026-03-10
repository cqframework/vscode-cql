import { expect } from 'chai';
import { parseMajorVersion } from '../../../java-support/findJavaRuntimes';

suite('parseMajorVersion()', () => {
  test('parses legacy 1.8 as 8', () => {
    expect(parseMajorVersion('1.8')).to.equal(8);
  });

  test('parses legacy 1.8.0_202 as 8', () => {
    expect(parseMajorVersion('1.8.0_202')).to.equal(8);
  });

  test('parses 11 as 11', () => {
    expect(parseMajorVersion('11')).to.equal(11);
  });

  test('parses 17.0.3 as 17', () => {
    expect(parseMajorVersion('17.0.3')).to.equal(17);
  });

  test('parses 21.0.1+12 as 21', () => {
    expect(parseMajorVersion('21.0.1+12')).to.equal(21);
  });

  test('parses 21 as 21', () => {
    expect(parseMajorVersion('21')).to.equal(21);
  });

  test('returns 0 for empty string', () => {
    expect(parseMajorVersion('')).to.equal(0);
  });
});
