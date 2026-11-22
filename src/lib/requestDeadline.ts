/** Bounds token retrieval, network I/O and response parsing, including on RN. */
export class RequestDeadlineError extends Error {
  constructor() { super("Превышено время ожидания ответа"); this.name = "RequestDeadlineError"; }
}

export function checkRequestActive(signal: AbortSignal) {
  if (signal.aborted) {
    const error = new Error("Запрос отменён");
    error.name = "AbortError";
    throw error;
  }
}

export async function withRequestDeadline<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
  external?: AbortSignal,
): Promise<T> {
  if (external) checkRequestActive(external);
  const controller = new AbortController();
  let rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const abort = () => {
    const error = new Error("Запрос отменён");
    error.name = "AbortError";
    rejectStop(error);
    controller.abort();
  };
  const timer = setTimeout(() => {
    rejectStop(new RequestDeadlineError());
    controller.abort();
  }, timeoutMs);
  external?.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([stopped, Promise.resolve().then(() => {
      checkRequestActive(controller.signal);
      return run(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}
