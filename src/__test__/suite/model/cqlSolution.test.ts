import { expect } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { CqlProject } from '../../../model/cqlProject';
import { CqlSolution } from '../../../model/cqlSolution';
import { DeviationKind } from '../../../model/igLayoutDetector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeProject(igRoot: string, deviations: DeviationKind[] = []): CqlProject {
  return {
    igRoot,
    name: path.basename(igRoot),
    projectDeviations: new Set(deviations),
    Libraries: [],
  } as unknown as CqlProject;
}

/**
 * Construct a CqlSolution directly from known projects, bypassing the private
 * constructor. Used only in tests so we don't depend on workspace.workspaceFolders.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SolutionCtor = CqlSolution as any;
function solutionFrom(...projects: CqlProject[]): CqlSolution {
  return new SolutionCtor(projects) as CqlSolution;
}

// ---------------------------------------------------------------------------
// findProjectForUri
// ---------------------------------------------------------------------------

suite('CqlSolution.findProjectForUri()', () => {
  const sep = path.sep;

  test('returns project when URI equals igRoot exactly', () => {
    const p = fakeProject('/ws/project-a');
    const solution = solutionFrom(p);
    const result = solution.findProjectForUri(vscode.Uri.file('/ws/project-a'));
    expect(result).to.equal(p);
  });

  test('returns project when URI is a child of igRoot', () => {
    const p = fakeProject('/ws/project-a');
    const solution = solutionFrom(p);
    const result = solution.findProjectForUri(
      vscode.Uri.file('/ws/project-a' + sep + 'input' + sep + 'cql' + sep + 'Foo.cql'),
    );
    expect(result).to.equal(p);
  });

  test('returns undefined when URI is not under any project', () => {
    const p = fakeProject('/ws/project-a');
    const solution = solutionFrom(p);
    const result = solution.findProjectForUri(vscode.Uri.file('/ws/other-dir/Foo.cql'));
    expect(result).to.be.undefined;
  });

  test('does not match a path that shares a prefix but is not a path ancestor', () => {
    // /ws/project-ab should NOT match /ws/project-a
    const p = fakeProject('/ws/project-a');
    const solution = solutionFrom(p);
    const result = solution.findProjectForUri(vscode.Uri.file('/ws/project-ab/Foo.cql'));
    expect(result).to.be.undefined;
  });

  test('returns the correct project in a multi-project solution', () => {
    const pA = fakeProject('/ws/project-a');
    const pB = fakeProject('/ws/project-b');
    const solution = solutionFrom(pA, pB);

    expect(solution.findProjectForUri(
      vscode.Uri.file('/ws/project-a/input/cql/Foo.cql'),
    )).to.equal(pA);

    expect(solution.findProjectForUri(
      vscode.Uri.file('/ws/project-b/input/cql/Bar.cql'),
    )).to.equal(pB);
  });

  test('returns undefined when solution has no projects', () => {
    const solution = solutionFrom();
    expect(solution.findProjectForUri(vscode.Uri.file('/anything'))).to.be.undefined;
  });
});

// ---------------------------------------------------------------------------
// projects shape
// ---------------------------------------------------------------------------

suite('CqlSolution.projects', () => {
  test('projects array is frozen — push throws TypeError', () => {
    const p = fakeProject('/ws/project-a');
    const solution = solutionFrom(p);
    expect(() => {
      (solution.projects as CqlProject[]).push(fakeProject('/ws/other'));
    }).to.throw(TypeError);
  });

  test('projects contains all supplied projects in order', () => {
    const pA = fakeProject('/ws/a');
    const pB = fakeProject('/ws/b');
    const pC = fakeProject('/ws/c');
    const solution = solutionFrom(pA, pB, pC);
    expect(solution.projects).to.deep.equal([pA, pB, pC]);
  });

  test('empty solution has zero projects', () => {
    const solution = solutionFrom();
    expect(solution.projects).to.have.length(0);
  });
});

// ---------------------------------------------------------------------------
// getCurrent / reset
// ---------------------------------------------------------------------------

suite('CqlSolution.getCurrent() and reset()', () => {
  teardown(() => {
    CqlSolution.reset();
  });

  test('getCurrent() returns a CqlSolution instance', () => {
    const solution = CqlSolution.getCurrent();
    expect(solution).to.be.instanceOf(CqlSolution);
  });

  test('getCurrent() is idempotent — same instance on repeated calls', () => {
    const first = CqlSolution.getCurrent();
    const second = CqlSolution.getCurrent();
    expect(first).to.equal(second);
  });

  test('reset() causes getCurrent() to return a new instance', () => {
    const first = CqlSolution.getCurrent();
    CqlSolution.reset();
    const second = CqlSolution.getCurrent();
    expect(first).to.not.equal(second);
  });

  test('getCurrent() discovers at least one project in the test workspace', () => {
    const solution = CqlSolution.getCurrent();
    expect(solution.projects.length).to.be.greaterThan(0);
  });
});
