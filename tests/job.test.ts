import assert from 'node:assert/strict';
import test from 'node:test';
import { Job } from '../server/job.js';

test('starts queued without exposing its file path', () => {
  const job = new Job('job-1', 'example.docx', '/tmp/example.docx');

  assert.equal(job.status, 'queued');
  assert.equal(job.documentId, 'job-1');
  assert.equal(JSON.stringify(job).includes('/tmp/example.docx'), false);
});
