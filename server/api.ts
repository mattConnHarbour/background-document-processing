import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';

const api = Fastify({ logger: true });
await api.register(cors, { origin: process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5186' });
await api.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
const workerUrl = process.env.WORKER_URL ?? 'http://127.0.0.1:4301';

async function enqueueDocument(jobId: string, fileName: string, bytes: Uint8Array) {
  const body = new FormData();
  body.set('jobId', jobId);
  body.set('fileName', fileName);
  body.set('document', new Blob([new Uint8Array(bytes)]), fileName);
  const workerResponse = await fetch(`${workerUrl}/jobs`, {
    method: 'POST',
    body,
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

  try {
    const job = (await enqueueDocument(jobId, upload.filename, await upload.toBuffer())) as object;
    return reply
      .code(202)
      .header('location', `/api/documents/${jobId}`)
      .send({ ...job, statusUrl: `/api/documents/${jobId}` });
  } catch (error) {
    request.log.error(error);
    return reply.code(503).send({ error: 'The document could not be queued.' });
  }
});

api.get<{ Params: { jobId: string } }>('/api/documents/:jobId', async (request, reply) => {
  const workerResponse = await fetch(`${workerUrl}/jobs/${encodeURIComponent(request.params.jobId)}`);
  const body = await workerResponse.json();
  return reply.code(workerResponse.status).send(body);
});

api.get('/health', async () => ({ ok: true }));

await api.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 4300) });
