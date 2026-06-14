import dotenvFlow from 'dotenv-flow';
import * as z from 'zod';

process.env.TZ = 'Asia/Phnom_Penh';

dotenvFlow.config({ silent: true });

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID is required'),
  GUILD_ID: z.string().min(1, 'GUILD_ID is required'),
  ADMIN_ROLE_ID: z.string().min(1, 'ADMIN_ROLE_ID is required'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URI: z.string().optional().default(''),
  LOG_CHANNEL_ID: z.string().optional().default(''),
  HMAC_SECRET: z.string().min(32, 'HMAC_SECRET must be at least 32 characters'),
  API_PORT: z
    .string()
    .optional()
    .default('3000')
    .transform((v) => parseInt(v, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('production'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `  → ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  process.stderr.write(`\n[FATAL] Environment validation failed:\n${errors}\n\n`);
  process.exit(1);
}

export const config = Object.freeze(parsed.data);
