// Mixin helper for the DatabaseStorage class split (Phase 7 #4+).
//
// `DatabaseStorage` in server/storage.ts has historically been a single
// 11k-line class implementing every data-access method on the app.
// To split it without changing call sites (every other module calls
// `storage.<method>()` against a singleton), we use the standard
// TypeScript mixin pattern:
//
//   1. Each domain becomes a class in `server/storage/<domain>.ts`
//      (e.g. `TagsStorageMixin`).
//   2. `DatabaseStorage` declares the mixin's methods via interface
//      declaration merging:
//        export interface DatabaseStorage extends TagsStorageMixin {}
//   3. After class definition, `applyMixins(DatabaseStorage, [...])`
//      copies the prototype methods at module load time.
//
// At runtime the mixin methods are indistinguishable from methods
// defined on the class directly — `this` resolves through the
// prototype chain, so cross-domain calls like `this.getProject()`
// keep working even if the caller and callee are in different
// mixin files.
//
// Reference: https://www.typescriptlang.org/docs/handbook/mixins.html

export function applyMixins(target: any, mixins: any[]): void {
  mixins.forEach((mixin) => {
    Object.getOwnPropertyNames(mixin.prototype).forEach((name) => {
      if (name === "constructor") return;
      Object.defineProperty(
        target.prototype,
        name,
        Object.getOwnPropertyDescriptor(mixin.prototype, name) ||
          Object.create(null),
      );
    });
  });
}
