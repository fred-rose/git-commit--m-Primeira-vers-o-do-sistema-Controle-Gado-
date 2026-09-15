import { readFile, writeFile } from 'node:fs/promises';
const env = { ...process.env };
try {
  for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const url = env.SUPABASE_URL || '', key = env.SUPABASE_ANON_KEY || '';
if (!url || !key) throw new Error('Preencha SUPABASE_URL e SUPABASE_ANON_KEY no .env.');
if (!/^https:\/\/[a-z0-9.-]+\/?$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(url)) throw new Error('URL Supabase inválida.');
let role;
try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role; } catch {}
if (key.startsWith('sb_secret_') || role === 'service_role' || (!key.startsWith('sb_publishable_') && role !== 'anon')) throw new Error('Use apenas chave pública publishable ou anon.');
await writeFile('js/config.js', `// Configuração pública. Gerada por scripts/configure.js.\nexport const config = ${JSON.stringify({ supabaseUrl: url.replace(/\/$/, ''), supabaseAnonKey: key }, null, 2)};\n`);
process.stdout.write('Configuração pública preparada. Nenhum segredo privado foi gravado.\n');
