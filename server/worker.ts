import { Server } from '@hocuspocus/server';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Job } from './job.js';

const worker = Fastify({ logger: true });
const collaborationServer = Server.configure({ port: 4302 });
const jobs = new Map<string, Job>();
const uploadsDirectory = fileURLToPath(new URL('../.data/uploads/', import.meta.url));
await worker.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
await mkdir(uploadsDirectory, { recursive: true });

function fieldValue(field: unknown): string | undefined {
  if (!field || typeof field !== 'object' || !('value' in field)) return undefined;
  return typeof field.value === 'string' ? field.value : undefined;
}

worker.post('/jobs', async (request, reply) => {
  const upload = await request.file();
  const jobId = fieldValue(upload?.fields.jobId);
  const fileName = fieldValue(upload?.fields.fileName);
  if (!upload || !jobId || !fileName) {
    return reply.code(400).send({ error: 'jobId, fileName, and document are required.' });
  }
  if (jobs.has(jobId)) return reply.code(409).send({ error: 'Job already exists.' });

  const filePath = path.join(uploadsDirectory, `${jobId}.docx`);
  try {
    await pipeline(upload.file, createWriteStream(filePath, { flags: 'wx' }));
    const job = new Job(jobId, fileName, filePath);
    jobs.set(jobId, job);
    void job.run();
    return reply.code(202).send(job);
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
});

worker.get<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
  const job = jobs.get(request.params.jobId);
  if (!job) return reply.code(404).send({ error: 'Job not found.' });
  return job;
});

await Promise.all([worker.listen({ host: '0.0.0.0', port: 4301 }), collaborationServer.listen()]);

const stop = async () => {
  await Promise.all([...jobs.values()].map((job) => job.close()));
  await worker.close();
  await collaborationServer.destroy();
};

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
