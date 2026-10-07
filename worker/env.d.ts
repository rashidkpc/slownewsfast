// Secrets set via `wrangler secret put` are not present in the generated
// worker-configuration.d.ts, so declare them here.
interface Env {
  PASSWORD: string;
}
