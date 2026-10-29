const major = Number(process.versions.node.split('.')[0]);

if (major !== 24) {
  console.error(`Agent Foundry requires Node 24; found ${process.version}`);
  process.exitCode = 1;
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(':memory:');

  database.close();
  console.log(`Supported Node runtime and SQLite available: ${process.version}`);
}
