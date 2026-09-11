import { useEffect, useState, type FormEvent } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

type JobStatus = 'queued' | 'opening' | 'waiting' | 'ready' | 'failed';

interface Job {
  id: string;
  fileName: string;
  status: JobStatus;
  documentId: string;
  error?: string;
}

const terminalStatuses = new Set<JobStatus>(['ready', 'failed']);

export function App() {
  const [job, setJob] = useState<Job>();
  const [sourceFile, setSourceFile] = useState<Blob>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  // Poll the API for worker updates until the job succeeds or fails.
  useEffect(() => {
    if (!job || terminalStatuses.has(job.status)) return;

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/documents/${job.id}`);
      if (response.ok) setJob((await response.json()) as Job);
    }, 500);

    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  // Once processing is complete, mount SuperDoc and join the worker's room.
  useEffect(() => {
    if (job?.status !== 'ready' || !sourceFile) return;

    const editor = new SuperDoc({
      selector: '#editor',
      documents: [
        {
          id: job.documentId,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          data: sourceFile,
          v2Collaboration: {
            providerType: 'hocuspocus',
            documentId: job.documentId,
            serverUrl: 'ws://127.0.0.1:4302',
            roomMode: 'join',
          },
        },
      ],
      user: { name: 'Browser user', email: 'browser@example.com' },
      onException: ({ error: editorError }) => setError(String(editorError)),
    });

    return () => editor.destroy();
  }, [job?.documentId, job?.status, sourceFile]);

  // Upload the DOCX and keep the browser copy available for the editor.
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const document = formData.get('document');
    setUploading(true);
    setError(undefined);
    setJob(undefined);

    try {
      const response = await fetch('/api/documents', { method: 'POST', body: formData });
      const body = (await response.json()) as Job | { error: string };
      if (!response.ok) throw new Error('error' in body ? body.error : 'Document failed to load.');
      if (!(document instanceof File)) throw new Error('Select a DOCX file.');
      setSourceFile(document);
      setJob(body as Job);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">Fastify + React</p>
      <h1>Background document processing</h1>
      <p>Upload a DOCX. The API returns while a separate worker opens and processes it.</p>

      <form onSubmit={upload}>
        <input type="file" name="document" accept=".docx" required />
        <button disabled={uploading}>{uploading ? 'Starting…' : 'Process document'}</button>
      </form>

      {error && <p className="error">{error}</p>}
      {job && (
        <section aria-live="polite">
          <dl>
            <div><dt>Document</dt><dd>{job.fileName}</dd></div>
            <div><dt>Job ID</dt><dd><code>{job.id}</code></dd></div>
            <div><dt>Status</dt><dd><span className={`status ${job.status}`}>{job.status}</span></dd></div>
          </dl>
          {job.status === 'waiting' && <p>The document is open. Simulating additional wait time…</p>}
          {job.status === 'ready' && <p>The document is ready. Connecting to its collaboration room…</p>}
          {job.error && <p className="error">{job.error}</p>}
        </section>
      )}
      {job?.status === 'ready' && <div id="editor" />}
    </main>
  );
}
