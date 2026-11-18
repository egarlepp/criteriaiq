// Minimal declaration shim for `cookie-signature`, a transitive dep
// pulled in by `express-session`. Used by
// `server/auth/simpleAuth.ts:verifyWebSocketSession()` to unsign the
// session cookie at WebSocket upgrade time. The package itself ships no
// types and `@types/cookie-signature` is not in the dependency tree —
// rather than adding a new dev-dep just for this, we describe the two
// functions inline.
declare module "cookie-signature" {
  export function sign(value: string, secret: string): string;
  export function unsign(input: string, secret: string): string | false;
}
