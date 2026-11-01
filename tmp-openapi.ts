import { writeFileSync } from 'node:fs';
import { buildApp } from './src/app';

async function main(): Promise<void> {
  const app = await buildApp({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/docs/json' });
  writeFileSync('openapi.json', JSON.stringify(res.json(), null, 2));
  await app.close();
}

void main();
