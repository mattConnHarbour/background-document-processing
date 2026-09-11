import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const api = Fastify({ logger: true });
await api.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
const uploadsDirectory = fileURLToPath(new URL('../.data/uploads/', import.meta.url));
await mkdir(uploadsDirectory, { recursive: true });

async function enqueueDocument(jobId: string, fileName: string, filePath: string) {
  const workerResponse = await fetch('http://127.0.0.1:4301/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId, fileName, filePath }),
  });
  if (!workerResponse.ok) throw new Error(`Worker rejected the job with HTTP ${workerResponse.status}.`);
  return workerResponse.json();
}

api.post('/api/documents', async (request, reply) => {
  const upload = await request.file();
  if (!upload || !upload.filename.toLowerCase().endsWith('.docx')) {
    return reply.code(400).send({ error: 'Upload one .docx file.' });
  }

  const jobId = randomUUID();
  const uploadPath = path.join(uploadsDirectory, `${jobId}.docx`);

  try {
    await pipeline(upload.file, createWriteStream(uploadPath, { flags: 'wx' }));
    const job = (await enqueueDocument(jobId, upload.filename, uploadPath)) as object;
    return reply
      .code(202)
      .header('location', `/api/documents/${jobId}`)
      .send({ ...job, statusUrl: `/api/documents/${jobId}` });
  } catch (error) {
    await unlink(uploadPath).catch(() => undefined);
    request.log.error(error);
    return reply.code(503).send({ error: 'The document could not be queued.' });
  }
});

api.get<{ Params: { jobId: string } }>('/api/documents/:jobId', async (request, reply) => {
  const workerResponse = await fetch(`http://127.0.0.1:4301/jobs/${encodeURIComponent(request.params.jobId)}`);
  const body = await workerResponse.json();
  return reply.code(workerResponse.status).send(body);
});

await api.listen({ host: '127.0.0.1', port: 4300 });
