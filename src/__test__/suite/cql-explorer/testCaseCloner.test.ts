import { expect } from 'chai';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Uri } from 'vscode';
import { cloneTestCase } from '../../../cql-explorer/testCaseCloner';

suite('cloneTestCase', () => {
  let tmpDir: string;
  let srcDir: string;

  const OLD_PATIENT_ID = 'aaaa-0000-cccc';
  const OLD_REPORT_ID = '9876';

  const measureReportContent = JSON.stringify({
    resourceType: 'MeasureReport',
    id: OLD_REPORT_ID,
    evaluatedResource: [{ reference: `Patient/${OLD_PATIENT_ID}` }],
    contained: [{ parameter: [{ valueString: OLD_PATIENT_ID }] }],
  });

  setup(() => {
    // Normalize through Uri.file so the drive letter is capitalised on Windows,
    // matching what cloneTestCase returns via Uri.file(destDir).fsPath.
    tmpDir = Uri.file(fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-clone-'))).fsPath;
    srcDir = path.join(tmpDir, OLD_PATIENT_ID);
    fs.mkdirSync(srcDir);
    fs.writeFileSync(
      path.join(srcDir, `Patient-${OLD_PATIENT_ID}.json`),
      JSON.stringify({ resourceType: 'Patient', id: OLD_PATIENT_ID }),
      'utf8',
    );
    fs.writeFileSync(
      path.join(srcDir, `MeasureReport-${OLD_REPORT_ID}.json`),
      measureReportContent,
      'utf8',
    );
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('dest dir exists with a different name than source', async () => {
    const destUri = await cloneTestCase(Uri.file(srcDir));
    const destDir = destUri.fsPath;
    expect(fs.existsSync(destDir)).to.be.true;
    expect(path.basename(destDir)).to.not.equal(OLD_PATIENT_ID);
    expect(path.dirname(destDir)).to.equal(tmpDir);
  });

  test('source dir and files are unchanged', async () => {
    await cloneTestCase(Uri.file(srcDir));
    const srcFiles = fs.readdirSync(srcDir);
    expect(srcFiles).to.include(`Patient-${OLD_PATIENT_ID}.json`);
    expect(srcFiles).to.include(`MeasureReport-${OLD_REPORT_ID}.json`);
    const reportContent = fs.readFileSync(
      path.join(srcDir, `MeasureReport-${OLD_REPORT_ID}.json`),
      'utf8',
    );
    expect(reportContent).to.equal(measureReportContent);
  });

  test('no file in dest dir contains any old ID', async () => {
    const destUri = await cloneTestCase(Uri.file(srcDir));
    const destDir = destUri.fsPath;
    for (const file of fs.readdirSync(destDir)) {
      const content = fs.readFileSync(path.join(destDir, file), 'utf8');
      expect(content).to.not.include(OLD_PATIENT_ID, `old patient ID found in ${file}`);
      expect(content).to.not.include(OLD_REPORT_ID, `old report ID found in ${file}`);
    }
  });

  test('filenames in dest use new IDs (no original names present)', async () => {
    const destUri = await cloneTestCase(Uri.file(srcDir));
    const destDir = destUri.fsPath;
    const destFiles = fs.readdirSync(destDir);
    for (const file of destFiles) {
      expect(file).to.not.include(OLD_PATIENT_ID, `old patient ID found in filename ${file}`);
      expect(file).to.not.include(OLD_REPORT_ID, `old report ID found in filename ${file}`);
    }
  });

  test('new directory name appears in MeasureReport content (patient reference updated)', async () => {
    const destUri = await cloneTestCase(Uri.file(srcDir));
    const destDir = destUri.fsPath;
    const newPatientId = path.basename(destDir);
    const destFiles = fs.readdirSync(destDir);
    const reportFile = destFiles.find(f => f.startsWith('MeasureReport-'));
    expect(reportFile).to.exist;
    const content = fs.readFileSync(path.join(destDir, reportFile!), 'utf8');
    expect(content).to.include(newPatientId);
  });

  test('longest-ID-first: longer ID fully replaced without corruption by shorter pass', async () => {
    // OLD_REPORT_ID '9876' is a suffix of nothing here, but we set up a case where
    // one ID is a prefix of another: 'aabb' and 'aabb-extra'.
    // If short-first, 'aabb' would replace the start of 'aabb-extra', leaving '-extra'
    // and breaking the longer replacement.
    const LONG_ID = 'aabb-extra';
    const SHORT_ID = 'aabb';
    const specialSrcDir = path.join(tmpDir, SHORT_ID);
    fs.mkdirSync(specialSrcDir);
    // Two resource files: one whose ID starts with SHORT_ID, one whose ID is LONG_ID
    fs.writeFileSync(
      path.join(specialSrcDir, `Patient-${SHORT_ID}.json`),
      JSON.stringify({ resourceType: 'Patient', id: SHORT_ID, ref: LONG_ID }),
      'utf8',
    );
    fs.writeFileSync(
      path.join(specialSrcDir, `Condition-${LONG_ID}.json`),
      JSON.stringify({ resourceType: 'Condition', id: LONG_ID, subject: SHORT_ID }),
      'utf8',
    );

    const destUri = await cloneTestCase(Uri.file(specialSrcDir));
    const destDir = destUri.fsPath;
    const destFiles = fs.readdirSync(destDir);

    // Neither old ID should appear anywhere in filenames or content
    for (const file of destFiles) {
      expect(file).to.not.include(SHORT_ID, `old short ID found in filename ${file}`);
      expect(file).to.not.include(LONG_ID, `old long ID found in filename ${file}`);
      const content = fs.readFileSync(path.join(destDir, file), 'utf8');
      expect(content).to.not.include(SHORT_ID, `old short ID found in content of ${file}`);
      expect(content).to.not.include(LONG_ID, `old long ID found in content of ${file}`);
    }
  });
});
