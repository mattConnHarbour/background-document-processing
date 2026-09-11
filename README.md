# Background document processing

A minimal React and Fastify demo for opening a DOCX in a separate Node worker without blocking the upload request.

The flow is:

1. React uploads a DOCX to the Fastify API.
2. The API stores it and submits a job to a separate Fastify worker.
3. The worker opens it with the SuperDoc Node SDK and creates a collaboration room.
4. React polls the API until the job is ready, then joins the same room and displays the document.

Jobs and open SDK document handles live in the worker's memory. Restarting the worker clears every job. Uploaded files are stored under `.data/`, which is ignored by Git.

## Run

```bash
pnpm install
pnpm dev
```

Open <http://127.0.0.1:5186> and upload a `.docx`.

The processes listen on these ports:

- React/Vite: `5186`
- Upload and status API: `4300`
- Background worker: `4301`
- Collaboration WebSocket server: `4302`
