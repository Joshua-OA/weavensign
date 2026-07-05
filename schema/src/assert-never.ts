/** Exhaustiveness guard: a call site that still compiles here means a DesignNode variant was left unhandled. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}
