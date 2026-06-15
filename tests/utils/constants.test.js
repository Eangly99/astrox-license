import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseConstants(fileContent) {
  const regex = /export\s+const\s+(\w+)\s*=\s*(?:Object\.freeze\()?({[\s\S]*?})(?:\)|as const)?;?/g;
  const constants = {};
  let match;
  while ((match = regex.exec(fileContent)) !== null) {
    const name = match[1];
    let objStr = match[2]
      .replace(/(\w+):/g, '"$1":')   // quote keys
      .replace(/'/g, '"')            // convert single quotes to double quotes
      .replace(/,\s*}/g, '}')         // remove trailing commas before closing braces
      .replace(/\s+/g, ' ');         // collapse whitespace
      
    try {
      constants[name] = JSON.parse(objStr);
    } catch (e) {
      // Fallback if strict JSON fails - try eval safely in sandbox context
      try {
        const fn = new Function(`return ${match[2]}`);
        constants[name] = fn();
      } catch (innerErr) {
        console.error(`Failed to parse constant ${name}:`, objStr, innerErr);
      }
    }
  }
  return constants;
}

describe('Constants Synchronization Test', () => {
  it('should ensure bot and dashboard constants files are identical for common properties', () => {
    const botPath = path.resolve(__dirname, '../../src/utils/constants.js');
    const dashPath = path.resolve(__dirname, '../../../astrox-license-dash/src/lib/constants.ts');

    expect(fs.existsSync(botPath)).toBe(true);
    expect(fs.existsSync(dashPath)).toBe(true);

    const botContent = fs.readFileSync(botPath, 'utf-8');
    const dashContent = fs.readFileSync(dashPath, 'utf-8');

    const botConstants = parseConstants(botContent);
    const dashConstants = parseConstants(dashContent);

    const sharedKeys = ['LICENSE_STATUS', 'LICENSE_TYPES', 'AUDIT_ACTIONS', 'BLACKLIST_TYPES'];
    
    for (const key of sharedKeys) {
      expect(botConstants[key]).toBeDefined();
      expect(dashConstants[key]).toBeDefined();
      expect(botConstants[key]).toEqual(dashConstants[key]);
    }
  });
});
