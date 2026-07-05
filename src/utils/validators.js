import * as z from 'zod';
import { LICENSE_TYPES, BLACKLIST_TYPES } from './constants.js';

/** Validate license generation input from slash command */
export const generateLicenseSchema = z.object({
  pluginId: z.string().min(1),
  userId: z.string().min(1),
  type: z.enum([LICENSE_TYPES.TRIAL, LICENSE_TYPES.LIFETIME, LICENSE_TYPES.SUBSCRIPTION]),
  duration: z.string().optional(),
  maxIps: z.number().int().min(-1).max(10000).refine((val) => val !== 0, 'IP limit cannot be 0').optional(),
});

/** Validate the REST API /validate request body */
export const validateRequestSchema = z.object({
  licenseKey: z.string().min(1),
  pluginId: z.string().min(1),
  serverIp: z
    .string()
    .regex(
      /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^::$|^::ffff:(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      'Invalid IP address format',
    ),
  hwid: z.string().min(8).max(128),
});

/** Validate blacklist add input */
export const blacklistAddSchema = z.object({
  type: z.enum([BLACKLIST_TYPES.KEY, BLACKLIST_TYPES.HWID, BLACKLIST_TYPES.IP]),
  value: z.string().min(1),
  reason: z.string().min(1).max(500),
});

/** Validate plugin registration input */
export const pluginCreateSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
  version: z.string().optional().default('1.0.0'),
  description: z.string().max(256).optional().default(''),
  iconUrl: z.url().optional(),
});

/** Validate transfer input */
export const transferLicenseSchema = z.object({
  key: z.string().min(1),
  newOwnerId: z.string().min(1),
});

/** Validate pagination query */
export const paginationSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(25).optional().default(10),
});
