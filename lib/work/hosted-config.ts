import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import type { HostedWorkAuthConfig } from "./hosted-auth";

const text = (max: number) => z.string().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const httpsUrl = z.string().max(2048).refine((value) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }
  catch { return false; }
});
const schema = z.object({
  schemaVersion: z.literal(1), syntheticOnly: z.literal(true),
  publicOrigin: httpsUrl,
  listenHost: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
  listenPort: z.number().int().min(1024).max(65535).default(3400),
  storePath: z.string().min(1).max(4096),
  hapiUrl: z.literal("http://hapi:8080/fhir").default("http://hapi:8080/fhir"),
  issuer: httpsUrl, jwksUri: httpsUrl, authorizationEndpoint: httpsUrl, tokenEndpoint: httpsUrl,
  reviewerSubject: text(512), reviewerClientId: text(256), reviewerClientSecret: text(4096).optional(),
  assistantIdentities: z.array(z.object({ clientId: text(256), subject: text(512) }).strict()).min(1).max(256),
}).strict();

export type HostedWorkConfig = z.infer<typeof schema>;

/** Operator configuration, never derived from requests or model input. */
export function parseHostedWorkConfig(value: unknown): HostedWorkConfig {
  try {
    const config = schema.parse(value);
    const origin = new URL(config.publicOrigin);
    if (origin.origin !== config.publicOrigin || config.storePath !== resolve(config.storePath)) throw new Error();
    const authority = new URL(config.issuer);
    if ([config.jwksUri, config.authorizationEndpoint, config.tokenEndpoint].some((endpoint) => new URL(endpoint).origin !== authority.origin)) throw new Error();
    if (config.assistantIdentities.some((entry) => entry.subject === config.reviewerSubject)) throw new Error();
    if (new Set(config.assistantIdentities.map((entry) => JSON.stringify([entry.clientId, entry.subject]))).size !== config.assistantIdentities.length) throw new Error();
    return config;
  } catch { throw new Error("Hosted Work configuration is invalid. Use the documented synthetic-only schema and HTTPS identity endpoints."); }
}

export function readHostedWorkConfig(path: string): HostedWorkConfig {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    const limit = 64 * 1024;
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit || (stat.mode & 0o077) !== 0) throw new Error();
    const buffer = Buffer.alloc(limit + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const count = readSync(descriptor, buffer, bytes, buffer.length - bytes, null);
      if (count === 0) break;
      bytes += count;
    }
    const after = fstatSync(descriptor);
    if (bytes > limit || after.size !== bytes || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || after.nlink !== 1 || (after.mode & 0o077) !== 0) throw new Error();
    return parseHostedWorkConfig(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes))));
  } catch { throw new Error("Hosted Work requires a readable, private configuration file (0600 or 0400). Configuration details were withheld."); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

export function hostedWorkAuthConfig(config: HostedWorkConfig): HostedWorkAuthConfig {
  return {
    issuer: config.issuer, jwksUri: config.jwksUri, resource: `${config.publicOrigin}/mcp`,
    tenantId: "synthetic-work-lab", assistantIdentities: config.assistantIdentities,
    reviewer: {
      subject: config.reviewerSubject, clientId: config.reviewerClientId, clientSecret: config.reviewerClientSecret,
      authorizationEndpoint: config.authorizationEndpoint, tokenEndpoint: config.tokenEndpoint,
      redirectUri: `${config.publicOrigin}/auth/callback`,
    },
  };
}
