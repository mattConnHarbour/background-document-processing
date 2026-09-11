import { SuperDocClient } from '@superdoc/sdk';

export type JobStatus = 'queued' | 'opening' | 'waiting' | 'ready' | 'failed';

export class Job {
  status: JobStatus = 'queued';
  error?: string;
  readonly documentId: string;
  #filePath: string;
  #sdk?: SuperDocClient;
  #document?: Awaited<ReturnType<SuperDocClient['open']>>;

  constructor(
    readonly id: string,
    readonly fileName: string,
    filePath: string,
    readonly collaborationUrl = process.env.PUBLIC_COLLABORATION_URL ?? 'ws://127.0.0.1:4302',
  ) {
    this.documentId = id;
    this.#filePath = filePath;
  }

  async run(delayMs = Math.floor(Math.random() * 3_001) + 3_000): Promise<void> {
    this.#sdk = new SuperDocClient({ runtime: 'v2' });

    try {
      this.status = 'opening';
      await this.#sdk.connect();
      this.#document = await this.#sdk.open({
        doc: this.#filePath,
        collaboration: {
          providerType: 'hocuspocus',
          url: process.env.INTERNAL_COLLABORATION_URL ?? 'ws://127.0.0.1:4302',
          documentId: this.documentId,
          roomMode: 'create',
        },
      });
      this.status = 'waiting';
      // Sleep to simulate additional processing time while the client polls.
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      this.status = 'ready';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.status = 'failed';
      await this.close();
    }
  }

  async close(): Promise<void> {
    await this.#document?.close().catch(() => undefined);
    await this.#sdk?.dispose().catch(() => undefined);
    this.#document = undefined;
    this.#sdk = undefined;
  }
}
