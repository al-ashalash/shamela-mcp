/**
 * Why the advertised schemas carry no dialect declaration.
 *
 * The SDK converts every tool's zod shapes to JSON Schema when it advertises
 * them, and stamps each one `$schema: draft-07` — two declarations per tool,
 * across every tool the server registers. At least one Anthropic client validates
 * structured results with a 2020-12-only validator and refuses the whole tool
 * the moment it sees that stamp. The 2.0.0 field test found every single tool
 * unreachable for exactly this reason, on the first call.
 *
 * It never bit before because output schemas are new in this release: input
 * schemas carried the same stamp through 1.2.0 and no client ever validated
 * them by dialect. The feature this release added is what exposed the fault.
 *
 * The fix is to remove the declaration, not replace it. Everything these
 * schemas actually use — type, properties, required, enum, items, anyOf,
 * additionalProperties — means the same thing in draft-07 and 2020-12, so a
 * schema that declares neither is read correctly by both validators, while a
 * schema declaring either dialect is refused by the other's strict validator.
 * Neutrality is the only spelling every client accepts.
 *
 * Done at the transport boundary rather than per tool, because the stamp is
 * added inside the SDK where no registration option reaches it — and because
 * the boundary covers every transport at once: stdio in production, the
 * in-memory pair in tests, and whatever a future client connects with.
 */

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

/**
 * Delete every `$schema: draft-07` key in place, at any depth.
 *
 * Only the KEY named `$schema` with exactly that value is touched. A string
 * VALUE that happens to contain the URL — a page of text quoting it, say —
 * is content, not a declaration, and passes through untouched.
 */
export function stripSchemaDialect(value: unknown): unknown {
    if (Array.isArray(value)) {
        for (const item of value) stripSchemaDialect(item);
        return value;
    }
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (record["$schema"] === DRAFT_07) delete record["$schema"];
        for (const key of Object.keys(record)) stripSchemaDialect(record[key]);
    }
    return value;
}

/**
 * Wrap a transport so everything it sends goes out dialect-neutral.
 *
 * Mutates and returns the same instance: transports are paired by identity
 * (the in-memory pair especially), so a copy would break the pairing.
 */
export function withNeutralSchemas<T extends Transport>(transport: T): T {
    const originalSend = transport.send.bind(transport);
    transport.send = (message, options) => originalSend(stripSchemaDialect(message) as typeof message, options);
    return transport;
}
