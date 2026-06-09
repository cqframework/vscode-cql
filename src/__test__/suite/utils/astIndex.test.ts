import { expect } from 'chai';
import { buildAstLineIndex, buildLocatorKey, sortAstBySourceOrder } from '../../../utils/astIndex';

suite('buildAstLineIndex()', () => {
  test('parses a single node with loc metadata', () => {
    const ast = `Library: Test (version 1.0.0) [id=0]
└── define: "Foo" [id=1, loc=3:1-5:10]`;

    const index = buildAstLineIndex(ast);

    expect(index.astToCqlLoc.size).to.equal(1);
    expect(index.astToCqlLoc.get(1)).to.deep.equal({
      startLine: 3,
      startCol: 1,
      endLine: 5,
      endCol: 10,
    });

    expect(index.cqlToAstLines.get(2)).to.deep.equal([1]); // CQL line 3 → 0-indexed 2
    expect(index.cqlToAstLines.get(3)).to.deep.equal([1]); // CQL line 4 → 0-indexed 3
    expect(index.cqlToAstLines.get(4)).to.deep.equal([1]); // CQL line 5 → 0-indexed 4
  });

  test('skips lines without loc metadata', () => {
    const ast = `Library: Test (version 1.0.0)
├── translator: CQL-to-ELM ?
├── schema: urn:hl7-org:elm r1
└── define: "Foo" [id=1, loc=3:1-5:10]`;

    const index = buildAstLineIndex(ast);

    expect(index.astToCqlLoc.size).to.equal(1);
    expect(index.astToCqlLoc.has(0)).to.be.false;
    expect(index.astToCqlLoc.has(1)).to.be.false;
    expect(index.astToCqlLoc.has(2)).to.be.false;
    expect(index.astToCqlLoc.has(3)).to.be.true;
  });

  test('handles multiple nodes with overlapping CQL ranges', () => {
    const ast = `Library: Test (version 1.0.0)
└── define: "Foo" [id=1, loc=3:1-5:10]
  └── Query [id=2, loc=4:1-5:10]`;

    const index = buildAstLineIndex(ast);

    expect(index.astToCqlLoc.size).to.equal(2);
    expect(index.astToCqlLoc.get(1)).to.deep.equal({
      startLine: 3, startCol: 1, endLine: 5, endCol: 10,
    });
    expect(index.astToCqlLoc.get(2)).to.deep.equal({
      startLine: 4, startCol: 1, endLine: 5, endCol: 10,
    });

    // CQL line 3 (0-indexed 2) → only AST line 1
    expect(index.cqlToAstLines.get(2)).to.deep.equal([1]);
    // CQL line 4 (0-indexed 3) → both AST lines 1 and 2
    expect(index.cqlToAstLines.get(3)).to.deep.equal([1, 2]);
    // CQL line 5 (0-indexed 4) → both AST lines 1 and 2
    expect(index.cqlToAstLines.get(4)).to.deep.equal([1, 2]);
  });

  test('returns empty index for content without loc metadata', () => {
    const ast = `Library: Test (version 1.0.0)
├── translator: CQL-to-ELM ?`;

    const index = buildAstLineIndex(ast);

    expect(index.astToCqlLoc.size).to.equal(0);
    expect(index.cqlToAstLines.size).to.equal(0);
  });

  test('returns empty index for empty content', () => {
    const index = buildAstLineIndex('');

    expect(index.astToCqlLoc.size).to.equal(0);
    expect(index.cqlToAstLines.size).to.equal(0);
  });

  test('parses single-line range (loc with same start and end line)', () => {
    const ast = `└── Literal: 1 [id=1, loc=4:5-4:5]`;

    const index = buildAstLineIndex(ast);
    expect(index.astToCqlLoc.get(0)).to.deep.equal({
      startLine: 4, startCol: 5, endLine: 4, endCol: 5,
    });
    expect(index.cqlToAstLines.get(3)).to.deep.equal([0]); // CQL line 4 → 0-indexed 3
  });

  test('parses single-position loc (no range)', () => {
    const ast = `└── Literal: 1 [id=1, loc=4:5]`;

    const index = buildAstLineIndex(ast);
    expect(index.astToCqlLoc.get(0)).to.deep.equal({
      startLine: 4, startCol: 5, endLine: 4, endCol: 5,
    });
    expect(index.cqlToAstLines.get(3)).to.deep.equal([0]);
  });

  test('handles loc without id prefix', () => {
    const ast = `└── define: "Foo" [loc=3:1-5:10]`;

    const index = buildAstLineIndex(ast);
    expect(index.astToCqlLoc.get(0)).to.deep.equal({
      startLine: 3, startCol: 1, endLine: 5, endCol: 10,
    });
  });

  test('returns no entry for unmapped CQL lines (blank / header lines)', () => {
    const ast = `Library: Test (version 1.0.0)
└── define: "Foo" [id=1, loc=3:1-5:10]`;

    const index = buildAstLineIndex(ast);
    // CQL line 1 (0-indexed 0 → library header) should have no mapping
    expect(index.cqlToAstLines.get(0)).to.be.undefined;
    // CQL line 2 (0-indexed 1) should have no mapping
    expect(index.cqlToAstLines.get(1)).to.be.undefined;
    // CQL line 3 (0-indexed 2) should have the mapping
    expect(index.cqlToAstLines.get(2)).to.deep.equal([1]);
  });

  test('parses real-world format from One.ast test fixture', () => {
    const ast = `Library: One (version unspecified) [id=0]
├── translator: CQL-to-ELM ?
├── schema: urn:hl7-org:elm r1
├── using: System (urn:hl7-org:elm-types:r1)
└── define: "One" returns System.Integer [id=208, loc=3:1-4:5]
  └── Literal: 1 [id=209, loc=4:5]`;

    const index = buildAstLineIndex(ast);

    expect(index.astToCqlLoc.size).to.equal(2);
    expect(index.astToCqlLoc.get(4)).to.deep.equal({
      startLine: 3, startCol: 1, endLine: 4, endCol: 5,
    });
    expect(index.astToCqlLoc.get(5)).to.deep.equal({
      startLine: 4, startCol: 5, endLine: 4, endCol: 5,
    });

    // CQL line 3 (0-indexed 2) → AST line 4 only
    expect(index.cqlToAstLines.get(2)).to.deep.equal([4]);
    // CQL line 4 (0-indexed 3) → both AST lines 4 and 5
    expect(index.cqlToAstLines.get(3)).to.deep.equal([4, 5]);
  });

  suite('locatorToAstLines', () => {
    test('populates locatorToAstLines for a normal range annotation', () => {
      const ast = `└── define: "Foo" [id=1, loc=4:1-4:20]`;
      const index = buildAstLineIndex(ast);
      const key = buildLocatorKey(4, 1, 4, 20);
      expect(index.locatorToAstLines.get(key)).to.deep.equal([0]);
    });

    test('maps multiple AST lines to the same key when their locators match', () => {
      const ast = `└── define: "Foo" [id=1, loc=4:1-4:20]
  └── Query [id=2, loc=4:1-4:20]`;
      const index = buildAstLineIndex(ast);
      const key = buildLocatorKey(4, 1, 4, 20);
      expect(index.locatorToAstLines.get(key)).to.deep.equal([0, 1]);
    });

    test('handles a single-position annotation (loc=4:5) using startLine:startCol twice', () => {
      const ast = `└── Literal: 1 [id=1, loc=4:5]`;
      const index = buildAstLineIndex(ast);
      const key = buildLocatorKey(4, 5, 4, 5);
      expect(index.locatorToAstLines.get(key)).to.deep.equal([0]);
    });

    test('cqlToAstLines still populated correctly (regression guard)', () => {
      const ast = `└── define: "Foo" [id=1, loc=4:1-4:20]
  └── Query [id=2, loc=4:1-4:20]`;
      const index = buildAstLineIndex(ast);
      expect(index.cqlToAstLines.get(3)).to.deep.equal([0, 1]);
    });
  });

  suite('localIdToAstLines', () => {
    test('populates localIdToAstLines for a node with id and loc', () => {
      const ast = `└── define: "One" [id=208, loc=3:1-4:5]`;
      const index = buildAstLineIndex(ast);
      expect(index.localIdToAstLines.get('208')).to.deep.equal([0]);
    });

    test('maps each AST line to its unique localId', () => {
      const ast = `Library: One (version unspecified) [id=0]
└── define: "One" returns System.Integer [id=208, loc=3:1-4:5]
  └── Literal: 1 [id=209, loc=4:5]`;
      const index = buildAstLineIndex(ast);
      expect(index.localIdToAstLines.get('0')).to.deep.equal([0]);
      expect(index.localIdToAstLines.get('208')).to.deep.equal([1]);
      expect(index.localIdToAstLines.get('209')).to.deep.equal([2]);
    });

    test('locatorToAstLines still populated correctly when localId is present (regression guard)', () => {
      const ast = `└── define: "One" [id=208, loc=3:1-4:5]`;
      const index = buildAstLineIndex(ast);
      expect(index.locatorToAstLines.size).to.equal(1);
    });
  });
});

suite('sortAstBySourceOrder()', () => {
  test('sorts defines by CQL start line, keeps non-defines in place', () => {
    const ast = `Library: Test (version 1.0.0)
├── translator: CQL-to-ELM ?
├── schema: urn:hl7-org:elm r1
├── context: Patient
├── define: "Denominator" [id=409, loc=40:1-41:22]
├── define: "Initial Population" [id=292, loc=36:1-38:67]
└── define: "Patient" [id=287, loc=34:1-34:15]`;

    const sorted = sortAstBySourceOrder(ast);
    const lines = sorted.split('\n');

    expect(lines[0]).to.equal('Library: Test (version 1.0.0)');
    // Non-defines stay in original order
    expect(lines[1]).to.equal('├── translator: CQL-to-ELM ?');
    expect(lines[2]).to.equal('├── schema: urn:hl7-org:elm r1');
    expect(lines[3]).to.equal('├── context: Patient');
    // Defines sorted by CQL line: 34, 36, 40
    expect(lines[4]).to.include('define: "Patient"');
    expect(lines[4]).to.include('loc=34:');
    expect(lines[5]).to.include('define: "Initial Population"');
    expect(lines[5]).to.include('loc=36:');
    expect(lines[6]).to.include('define: "Denominator"');
    expect(lines[6]).to.include('loc=40:');
    // Last item uses └──
    expect(lines[6]).to.match(/^└── define/);
  });

  test('preserves child nodes of each define when reordering', () => {
    const ast = `Library: Test (version 1.0.0)
├── context: Patient
├── define: "B" [id=2, loc=10:1-10:5]
│ └── Literal: 2 [id=3, loc=10:5]
└── define: "A" [id=1, loc=5:1-5:5]
  └── Literal: 1 [id=4, loc=5:5]`;

    const sorted = sortAstBySourceOrder(ast);
    const lines = sorted.split('\n');

    // A (loc=5) comes before B (loc=10)
    const aIdx = lines.findIndex(l => l.includes('define: "A"'));
    const bIdx = lines.findIndex(l => l.includes('define: "B"'));
    expect(aIdx).to.be.lessThan(bIdx);

    // Child nodes travel with their parent define
    expect(lines[aIdx + 1]).to.include('Literal: 1');
    expect(lines[bIdx + 1]).to.include('Literal: 2');
  });

  test('handles single define (no reordering needed)', () => {
    const ast = `Library: Test (version 1.0.0)
└── define: "Only" [id=1, loc=3:1-3:5]`;

    expect(sortAstBySourceOrder(ast)).to.equal(ast);
  });

  test('handles content without defines', () => {
    const ast = `Library: Test (version 1.0.0)
├── translator: CQL-to-ELM ?
└── schema: urn:hl7-org:elm r1`;

    expect(sortAstBySourceOrder(ast)).to.equal(ast);
  });

  test('fixes └── connector on last sorted define', () => {
    const ast = `Library: Test (version 1.0.0)
├── define: "B" [id=2, loc=10:1-10:5]
│ └── Literal: 2 [id=3, loc=10:5]
├── define: "C" [id=3, loc=15:1-15:5]
└── define: "A" [id=1, loc=5:1-5:5]`;

    const sorted = sortAstBySourceOrder(ast);
    const lines = sorted.split('\n');

    // Last define (highest loc) gets └──
    expect(lines[lines.length - 1]).to.match(/^└── define/);
    expect(lines[lines.length - 1]).to.include('"C"');
    // Others get ├── (find by content since child lines shift absolute indices)
    const aIdx = lines.findIndex(l => l.includes('define: "A"'));
    const bIdx = lines.findIndex(l => l.includes('define: "B"'));
    expect(lines[aIdx]).to.match(/^├── define/);
    expect(lines[aIdx]).to.include('"A"');
    expect(lines[bIdx]).to.match(/^├── define/);
    expect(lines[bIdx]).to.include('"B"');
  });

  test('sorts define function segments by CQL line alongside define segments', () => {
    const ast = `Library: Test (version 1.0.0)
├── define: "B" [id=1, loc=10:1-10:5]
├── define function: "Foo" [id=2, loc=5:1-5:5]
└── define: "A" [id=3, loc=15:1-15:5]`;

    const sorted = sortAstBySourceOrder(ast);
    const lines = sorted.split('\n');

    const fooIdx = lines.findIndex(l => l.includes('define function: "Foo"'));
    const bIdx = lines.findIndex(l => l.includes('define: "B"'));
    const aIdx = lines.findIndex(l => l.includes('define: "A"'));
    expect(fooIdx).to.be.lessThan(bIdx);
    expect(bIdx).to.be.lessThan(aIdx);
    // Last item (highest loc) gets └──
    expect(lines[lines.length - 1]).to.match(/^└── define/);
    expect(lines[lines.length - 1]).to.include('"A"');
  });

  test('sorts fluent function segments by source line', () => {
    const ast = `Library: Test (version 1.0.0)
├── define: "B" [id=1, loc=10:1-10:5]
├── define fluent function: "Bar" [id=2, loc=3:1-3:5]
└── define: "A" [id=3, loc=15:1-15:5]`;

    const sorted = sortAstBySourceOrder(ast);
    const lines = sorted.split('\n');

    const barIdx = lines.findIndex(l => l.includes('define fluent function: "Bar"'));
    const bIdx = lines.findIndex(l => l.includes('define: "B"'));
    expect(barIdx).to.be.lessThan(bIdx);
  });

  test('fixes └── connector after sort when last segment is a function def', () => {
    const ast = `Library: Test (version 1.0.0)
├── define: "A" [id=1, loc=5:1-5:5]
└── define function: "Foo" [id=2, loc=10:1-10:5]`;

    const sorted = sortAstBySourceOrder(ast);
    const lines = sorted.split('\n');

    const lastLine = lines[lines.length - 1];
    expect(lastLine).to.match(/^└── define function/);
    expect(lastLine).to.include('"Foo"');
  });

  test('returns input unchanged for empty or single-line content', () => {
    expect(sortAstBySourceOrder('')).to.equal('');
    expect(sortAstBySourceOrder('Library: Test (version 1.0.0)')).to.equal('Library: Test (version 1.0.0)');
  });
});
