import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const socketModule = resolve("src/worker-broker-socket.ts");
const socketTest = resolve("tests/worker-broker-socket.test.ts");
const brokerProbe = resolve("scripts/verify-broker-cross-uid.mjs");
for (const path of [socketModule, socketTest, brokerProbe]) {
  if (!existsSync(path)) {
    throw new Error("Missing broker socket dependency: " + path);
  }
}
const implementation = readFileSync(socketModule, "utf8");
if (!implementation.includes("export async function startWorkerBrokerSocket(")) {
  throw new Error("Missing startWorkerBrokerSocket export");
}
const probe = readFileSync(brokerProbe, "utf8");
if (!probe.includes("src/worker-broker-socket.ts")) {
  throw new Error("Broker probe does not reference the restored socket module");
}
console.log("PASS: broker socket implementation, tests and probe are present");
