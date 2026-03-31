import { expect } from 'chai';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Uri } from 'vscode';
import {
  copyResources,
  deleteResources,
  deleteTestCase,
  enhancedCopyResources,
  enhancedMoveResources,
  moveResources,
} from '../../../cql-explorer/testCaseResourceOps';

suite('testCaseResourceOps', () => {
  let tmpDir: string;

  // IDs used in the fixture test cases
  const SRC_PATIENT_ID = 'src-patient-aaaa';
  const DST_PATIENT_ID = 'dst-patient-bbbb';
  const ENC_ID = 'enc-1234';

  function makeSrcTestCase(): { srcPatientDir: string; encounterFile: string } {
    const srcPatientDir = path.join(tmpDir, SRC_PATIENT_ID);
    fs.mkdirSync(srcPatientDir);
    const encounterFile = path.join(srcPatientDir, `Encounter-${ENC_ID}.json`);
    fs.writeFileSync(
      encounterFile,
      JSON.stringify({ resourceType: 'Encounter', id: ENC_ID, subject: { reference: `Patient/${SRC_PATIENT_ID}` } }),
      'utf8',
    );
    return { srcPatientDir, encounterFile };
  }

  function makeDstTestCase(): string {
    const dstPatientDir = path.join(tmpDir, DST_PATIENT_ID);
    fs.mkdirSync(dstPatientDir);
    return dstPatientDir;
  }

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-resops-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- deleteResources ---

  test('deleteResources: file gone after call; sibling unaffected', async () => {
    const dir = path.join(tmpDir, 'tc1');
    fs.mkdirSync(dir);
    const fileA = path.join(dir, 'Patient-aaa.json');
    const fileB = path.join(dir, 'Encounter-bbb.json');
    fs.writeFileSync(fileA, '{}', 'utf8');
    fs.writeFileSync(fileB, '{}', 'utf8');

    await deleteResources([Uri.file(fileA)]);

    expect(fs.existsSync(fileA)).to.be.false;
    expect(fs.existsSync(fileB)).to.be.true;
  });

  // --- copyResources ---

  test('copyResources: source still exists; dest copy has same content', async () => {
    const { srcPatientDir, encounterFile } = makeSrcTestCase();
    const dstDir = makeDstTestCase();
    const srcContent = fs.readFileSync(encounterFile, 'utf8');

    await copyResources([Uri.file(encounterFile)], Uri.file(dstDir));

    expect(fs.existsSync(encounterFile)).to.be.true;
    const destFile = path.join(dstDir, path.basename(encounterFile));
    expect(fs.existsSync(destFile)).to.be.true;
    expect(fs.readFileSync(destFile, 'utf8')).to.equal(srcContent);
    // Source unchanged
    expect(fs.readFileSync(encounterFile, 'utf8')).to.equal(srcContent);
    void srcPatientDir;
  });

  test('copyResources: rejects when destination file already exists', async () => {
    const { srcPatientDir, encounterFile } = makeSrcTestCase();
    const dstDir = makeDstTestCase();
    // Pre-create the destination file
    fs.writeFileSync(path.join(dstDir, path.basename(encounterFile)), '{}', 'utf8');

    let threw = false;
    try {
      await copyResources([Uri.file(encounterFile)], Uri.file(dstDir));
    } catch {
      threw = true;
    }
    expect(threw).to.be.true;
    void srcPatientDir;
  });

  // --- moveResources ---

  test('moveResources: source gone; dest exists with original content', async () => {
    const { srcPatientDir, encounterFile } = makeSrcTestCase();
    const dstDir = makeDstTestCase();
    const originalContent = fs.readFileSync(encounterFile, 'utf8');

    await moveResources([Uri.file(encounterFile)], Uri.file(dstDir));

    expect(fs.existsSync(encounterFile)).to.be.false;
    const destFile = path.join(dstDir, path.basename(encounterFile));
    expect(fs.existsSync(destFile)).to.be.true;
    expect(fs.readFileSync(destFile, 'utf8')).to.equal(originalContent);
    void srcPatientDir;
  });

  // --- enhancedCopyResources ---

  test('enhancedCopyResources: patient UUID updated in filename and content', async () => {
    const { srcPatientDir, encounterFile } = makeSrcTestCase();
    const dstDir = makeDstTestCase();

    await enhancedCopyResources([Uri.file(encounterFile)], Uri.file(dstDir));

    // Source unchanged
    expect(fs.existsSync(encounterFile)).to.be.true;

    const destFiles = fs.readdirSync(dstDir);
    expect(destFiles).to.have.length(1);
    const destContent = fs.readFileSync(path.join(dstDir, destFiles[0]), 'utf8');

    // Old patient ID must be gone from filename and content
    expect(destFiles[0]).to.not.include(SRC_PATIENT_ID);
    expect(destContent).to.not.include(SRC_PATIENT_ID);

    // Destination patient ID must appear in content
    expect(destContent).to.include(DST_PATIENT_ID);
    void srcPatientDir;
  });

  test('enhancedCopyResources: cross-ref — two pasted resources get consistent new IDs', async () => {
    const srcDir = path.join(tmpDir, SRC_PATIENT_ID);
    fs.mkdirSync(srcDir);
    const encId = 'enc-9999';
    const obsId = 'obs-8888';
    const encFile = path.join(srcDir, `Encounter-${encId}.json`);
    const obsFile = path.join(srcDir, `Observation-${obsId}.json`);
    fs.writeFileSync(encFile, JSON.stringify({ resourceType: 'Encounter', id: encId }), 'utf8');
    fs.writeFileSync(
      obsFile,
      JSON.stringify({ resourceType: 'Observation', id: obsId, encounter: { reference: `Encounter/${encId}` } }),
      'utf8',
    );
    const dstDir = makeDstTestCase();

    await enhancedCopyResources([Uri.file(encFile), Uri.file(obsFile)], Uri.file(dstDir));

    const destFiles = fs.readdirSync(dstDir);
    expect(destFiles).to.have.length(2);

    const encDest = destFiles.find(f => f.startsWith('Encounter-'))!;
    const obsDest = destFiles.find(f => f.startsWith('Observation-'))!;
    expect(encDest).to.exist;
    expect(obsDest).to.exist;

    // Neither old ID should appear anywhere
    for (const f of destFiles) {
      const content = fs.readFileSync(path.join(dstDir, f), 'utf8');
      expect(f).to.not.include(encId);
      expect(f).to.not.include(obsId);
      expect(content).to.not.include(encId);
      expect(content).to.not.include(obsId);
    }

    // The new Encounter ID extracted from the Encounter filename should appear in the Observation content
    const newEncId = encDest.slice('Encounter-'.length, encDest.lastIndexOf('.'));
    const obsContent = fs.readFileSync(path.join(dstDir, obsDest), 'utf8');
    expect(obsContent).to.include(newEncId);
  });

  test('enhancedCopyResources: pasting into same dir assigns new resource IDs, patient ref unchanged', async () => {
    const { srcPatientDir, encounterFile } = makeSrcTestCase();

    await enhancedCopyResources([Uri.file(encounterFile)], Uri.file(srcPatientDir));

    const files = fs.readdirSync(srcPatientDir);
    // Original file still there plus new file
    expect(files).to.have.length(2);
    expect(files).to.include(path.basename(encounterFile));

    const newFile = files.find(f => f !== path.basename(encounterFile))!;
    expect(newFile).to.exist;
    const newContent = fs.readFileSync(path.join(srcPatientDir, newFile), 'utf8');
    // Old encounter ID must not appear in new file (new UUID assigned)
    expect(newContent).to.not.include(ENC_ID);
    // Patient ref unchanged (same dir → same patient ID)
    expect(newContent).to.include(SRC_PATIENT_ID);
  });

  // --- enhancedMoveResources ---

  test('enhancedMoveResources: source gone; dest has updated IDs', async () => {
    const { srcPatientDir, encounterFile } = makeSrcTestCase();
    const dstDir = makeDstTestCase();

    await enhancedMoveResources([Uri.file(encounterFile)], Uri.file(dstDir));

    expect(fs.existsSync(encounterFile)).to.be.false;
    const destFiles = fs.readdirSync(dstDir);
    expect(destFiles).to.have.length(1);
    const content = fs.readFileSync(path.join(dstDir, destFiles[0]), 'utf8');
    expect(content).to.not.include(SRC_PATIENT_ID);
    expect(content).to.include(DST_PATIENT_ID);
    void srcPatientDir;
  });

  // --- deleteTestCase ---

  test('deleteTestCase: entire directory removed', async () => {
    const tcDir = path.join(tmpDir, 'tc-to-delete');
    fs.mkdirSync(tcDir);
    fs.writeFileSync(path.join(tcDir, 'Patient-xyz.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(tcDir, 'MeasureReport-abc.json'), '{}', 'utf8');

    await deleteTestCase(Uri.file(tcDir));

    expect(fs.existsSync(tcDir)).to.be.false;
  });
});
