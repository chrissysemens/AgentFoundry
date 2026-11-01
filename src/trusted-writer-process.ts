import { startAuthenticatedTrustedWriter } from "./authenticated-trusted-writer.ts";
import type { TrustedMergeRequestHandler } from "./trusted-merge-request.ts";

/**
 * Run the protected writer until SIGINT or SIGTERM. The trusted process must
 * construct the evidence-backed handler locally, never from an IPC request.
 * No arbitrary module loading or fallback demo approval source is provided.
 */
export async function runTrustedWriterProcess(
  databasePath: string,
  socketPath: string,
  secretFile: string,
  trustedHandler: TrustedMergeRequestHandler,
  signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"],
): Promise<void> {
  const runtime = await startAuthenticatedTrustedWriter(
    databasePath,
    socketPath,
    secretFile,
    trustedHandler,
  );
  await new Promise<void>((resolve, reject) => {
    let stopping = false;
    const onSignal = () => {
      if (stopping) return;
      stopping = true;
      for (const signal of signals) process.off(signal, onSignal);
      void runtime.close().then(resolve, reject);
    };
    for (const signal of signals) process.on(signal, onSignal);
  });
}
