import { Server } from '@hocuspocus/server';
import Fastify from 'fastify';
import { Job } from './job.js';

const worker = Fastify({ logger: true });
const collaborationServer = Server.configure({ port: 4302 });
const jobs = new Map<string, Job>();

interface CreateJobBody {
  jobId?: string;
  fileName?: string;
  filePath?: string;
}

worker.post<{ Body: CreateJobBody }>('/jobs', async (request, reply) => {
  const { jobId, fileName, filePath } = request.body;
  if (!jobId || !fileName || !filePath) {
    return reply.code(400).send({ error: 'jobId, fileName, and filePath are required.' });
  }
  if (jobs.has(jobId)) return reply.code(409).send({ error: 'Job already exists.' });

  const job = new Job(jobId, fileName, filePath);
  jobs.set(jobId, job);
  void job.run();
  return reply.code(202).send(job);
});

worker.get<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
  const job = jobs.get(request.params.jobId);
  if (!job) return reply.code(404).send({ error: 'Job not found.' });
  return job;
});

await Promise.all([worker.listen({ host: '127.0.0.1', port: 4301 }), collaborationServer.listen()]);

const stop = async () => {
  await Promise.all([...jobs.values()].map((job) => job.close()));
  await worker.close();
  await collaborationServer.destroy();
};

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
