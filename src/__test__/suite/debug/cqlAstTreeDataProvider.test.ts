import { expect } from 'chai';
import { CqlAstTreeDataProvider } from '../../../debug/cqlAstTreeDataProvider';
import { parseAstToTree } from '../../../debug/cqlAstTreeNode';

suite('CqlAstTreeDataProvider', () => {
  const SAMPLE_AST = `Library: One (version unspecified) [id=0]
├── translator: CQL-to-ELM ?
├── schema: urn:hl7-org:elm r1
├── using: System (urn:hl7-org:elm-types:r1)
└── define: "One" returns System.Integer [id=208, loc=3:1-4:5]
  └── Literal: 1 [id=209, loc=4:5]`;

  suite('getChildren', () => {
    test('returns root nodes for a sample AST', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const children = provider.getChildren();
      expect(children.length).to.equal(1);
      expect(children[0].label).to.equal('Library: One (version unspecified)');
    });

    test('returns children of root node', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const rootChildren = provider.getChildren(roots[0]);
      expect(rootChildren.length).to.equal(4);
      expect(rootChildren[0].label).to.include('translator');
      expect(rootChildren[3].label).to.include('define: "One"');
    });

    test('returns grandchild nodes', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const defineNode = provider.getChildren(roots[0])[3];
      const grandChildren = provider.getChildren(defineNode);
      expect(grandChildren.length).to.equal(1);
      expect(grandChildren[0].label).to.equal('Literal: 1');
    });

    test('returns empty for leaf nodes', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const leafNode = provider.getChildren(roots[0])[0]; // translator has no children
      const children = provider.getChildren(leafNode);
      expect(children).to.deep.equal([]);
    });

    test('returns placeholder when in loading state', () => {
      const provider = new CqlAstTreeDataProvider();
      provider.setLoading();

      const children = provider.getChildren();
      expect(children.length).to.equal(1);
      expect(children[0].id).to.equal('__loading__');
      expect(children[0].label).to.equal('Loading AST...');
      expect(provider.getChildren(children[0])).to.deep.equal([]);
    });

    test('returns empty-state placeholder when no data', () => {
      const provider = new CqlAstTreeDataProvider();

      const children = provider.getChildren();
      expect(children.length).to.equal(1);
      expect(children[0].id).to.equal('__empty__');
      expect(children[0].label).to.equal('No active frame');
    });

    test('returns custom empty-state message when set', () => {
      const provider = new CqlAstTreeDataProvider();
      provider.setEmpty('Could not load AST');

      const children = provider.getChildren();
      expect(children[0].label).to.equal('Could not load AST');
    });
  });

  suite('getParent', () => {
    test('returns undefined for root nodes', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      expect(provider.getParent(roots[0])).to.be.undefined;
    });

    test('returns parent for nested node', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const defineNode = provider.getChildren(roots[0])[3];
      const literalNode = defineNode.children[0];
      const parent = provider.getParent(literalNode);
      expect(parent).to.equal(defineNode);
    });
  });

  suite('getTreeItem', () => {
    test('returns active styling for active node', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const node = roots[0];
      provider.setActiveNodeId(node.id);
      const item = provider.getTreeItem(node);

      expect(item.id).to.equal(node.id);
      expect(item.label).to.equal(node.label);
      expect(item.description).to.equal(node.description);
      expect(item.iconPath).to.not.be.undefined;
    });

    test('returns default styling for inactive node', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const node = provider.getChildren(roots[0])[0]; // translator (no id → path:0/0)
      const item = provider.getTreeItem(node);

      expect(item.id).to.equal(node.id);
      expect(item.label).to.equal(node.label);
      expect(item.iconPath).to.be.undefined;
    });

    test('sets collapsibleState based on children', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const leafItem = provider.getTreeItem(provider.getChildren(roots[0])[0]); // translator (no children)
      const parentItem = provider.getTreeItem(roots[0]); // Library (has children)

      // TreeItemCollapsibleState: None = 0, Collapsed = 1
      expect(leafItem.collapsibleState).to.equal(0); // None
      expect(parentItem.collapsibleState).to.equal(1); // Collapsed
    });

    test('includes inverse-navigation command', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);
      const provider = new CqlAstTreeDataProvider();
      provider.setData(roots);

      const item = provider.getTreeItem(roots[0]);
      expect(item.command).to.not.be.undefined;
      expect(item.command!.command).to.equal('cql.debug.ast.reveal-cql');
      expect(item.command!.arguments![0]).to.equal(roots[0]);
    });

    test('placeholder items have no command or description', () => {
      const provider = new CqlAstTreeDataProvider();
      provider.setLoading();

      const children = provider.getChildren();
      const item = provider.getTreeItem(children[0]);
      expect(item.command).to.be.undefined;
      expect(item.description).to.equal('');
    });
  });

  suite('stable ids', () => {
    test('uses lid: prefix when localId is present', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);

      const defineNode = providerGetChild(roots, 3);
      expect(defineNode.id).to.equal('lid:208');
      expect(defineNode.children[0].id).to.equal('lid:209');
    });

    test('uses path: prefix when no localId', () => {
      const { roots } = parseAstToTree(SAMPLE_AST);

      const translatorNode = providerGetChild(roots, 0);
      expect(translatorNode.id).to.match(/^path:/);
    });

    test('ids are stable across multiple calls', () => {
      const { roots: r1 } = parseAstToTree(SAMPLE_AST);
      const { roots: r2 } = parseAstToTree(SAMPLE_AST);
      expect(r1.length).to.equal(r2.length);
      for (let i = 0; i < r1.length; i++) {
        expect(r1[i].id).to.equal(r2[i].id);
      }
    });
  });
});

function providerGetChild(roots: any[], index: number) {
  const provider = new CqlAstTreeDataProvider();
  provider.setData(roots);
  return provider.getChildren(roots[0])[index];
}
