export async function register() {
  // Next.js собирает instrumentation отдельно для Node.js и Edge.
  // Firebase Admin поддерживает только Node.js, поэтому серверный код
  // должен находиться в отдельном модуле и импортироваться этим условием.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeInstrumentation } = await import(
      "./instrumentation-node"
    );
    registerNodeInstrumentation();
  }
}
