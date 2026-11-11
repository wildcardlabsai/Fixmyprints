import fs from 'fs';
import path from 'path';
import { getStaticBootstrapPayload } from '../src/data/staticBootstrap.ts';

const outDir = path.resolve(process.cwd(), 'public/api');
fs.mkdirSync(outDir, { recursive: true });

const payload = getStaticBootstrapPayload();
const jsonStr = JSON.stringify(payload);

// Write both bootstrap.json and extensionless bootstrap for maximum static compatibility
fs.writeFileSync(path.join(outDir, 'bootstrap.json'), jsonStr, 'utf-8');
fs.writeFileSync(path.join(outDir, 'bootstrap'), jsonStr, 'utf-8');

const coveragePayload = {
  counts: payload.coverageCounts,
  manufacturers: payload.manufacturers,
  models: payload.models.map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    technology: m.technology,
    bedLevelingCategory: m.bedLevelingCategory,
    completenessStatus: m.completenessStatus,
    lastVerifiedDate: m.lastVerifiedDate,
  })),
  pendingRequests: [],
};

const coverageStr = JSON.stringify(coveragePayload);
fs.writeFileSync(path.join(outDir, 'coverage.json'), coverageStr, 'utf-8');
fs.writeFileSync(path.join(outDir, 'coverage'), coverageStr, 'utf-8');

console.log(`[export-static-database] Successfully wrote static database snapshots to ${outDir}`);
console.log(` - Models: ${payload.models.length}`);
console.log(` - Manufacturers: ${payload.manufacturers.length}`);
console.log(` - Guides: ${payload.guides.length}`);
console.log(` - Error codes: ${payload.errorCodes.length}`);
