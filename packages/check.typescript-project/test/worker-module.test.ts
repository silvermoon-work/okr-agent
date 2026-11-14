import { expect, it } from "vitest";
import { environmentBindings, workerModule } from "../src/worker-module.js";
import { Unconfirmed } from "../src/files.js";

it.each([
  "export default {fetch(){ throw new Error('DO NOT EXECUTE'); }};",
  "const handler = {fetch: async () => new Response()}; export default handler;",
  "const handler = async () => new Response(); export default {fetch: handler};",
  'import {WorkerEntrypoint as Base} from "cloudflare:workers"; export default class extends Base { fetch(){return new Response()} }',
])(
  "recognizes finite HTTP module exports without executing them: %s",
  (source) => {
    expect(workerModule(source, false).fetch).toBe(true);
  },
);
it("strips only supported type syntax and identifies local DO classes and Node imports", () => {
  const shape = workerModule(
    `
import {DurableObject as Base} from "cloudflare:workers";
import {AsyncLocalStorage} from "node:async_hooks";
import * as other from "some-module";
export class Room extends Base<Env> {}
export class Legacy {}
export const metadata = 1;
export default {async fetch(request: Request): Promise<Response> { throw new Error("DO NOT EXECUTE"); }} satisfies ExportedHandler<Env>;
`,
    true,
  );
  expect([...shape.classes]).toEqual(["Room", "Legacy"]);
  expect([...shape.durable]).toEqual(["Room"]);
  expect([...shape.nodeImports]).toEqual(["node:async_hooks"]);
});
it.each([
  "invalid syntax [",
  "export default customWorker();",
  "export default { ...other, fetch(){} };",
  "export default { ['fetch'](){} };",
  "export default { get fetch(){return () => new Response()} };",
  "export default { fetch: unknownHandler };",
  'import handler from "framework"; export default handler;',
])(
  "does not pretend to understand indirect or dynamic module shapes: %s",
  (source) => {
    expect(() => workerModule(source, false)).toThrow(Unconfirmed);
  },
);
it.each([
  "export default { fetch: 1 };",
  'import {WorkerEntrypoint} from "cloudflare:workers"; export default class extends WorkerEntrypoint { static fetch(){} }',
  "export const metadata = 1;",
])("does not identify invalid/missing instance HTTP exports: %s", (source) => {
  expect(workerModule(source, false).fetch).toBe(false);
});
it("retains uncertainty for reexports rather than treating a remote or unresolved class as absent", () => {
  const shape = workerModule(
    'export {Room} from "./room"; export * from "./other";',
    false,
  );
  expect(shape.indirect).toBe(true);
});
it("reads finite generated Env data, quoted bindings and nested type values without runtime evaluation", () => {
  expect([
    ...environmentBindings(`
// namespace Cloudflare { interface Env { IGNORED: string; } }
declare namespace Cloudflare {
 interface Env {
  ROOM: DurableObjectNamespace<Room>;
  "STATIC-ASSETS"?: { fetch(request: Request): Promise<Response> };
 }
}
interface Env extends Cloudflare.Env {}
`),
  ]).toEqual(["ROOM", "STATIC-ASSETS"]);
});
it.each([
  "interface Env { ROOM: unknown; }",
  "declare namespace Cloudflare { interface Other {} }",
  "declare namespace Cloudflare { interface Env { [name: string]: unknown; } }",
  "declare namespace Cloudflare { interface Env { getBinding(): unknown; } }",
  "declare namespace Cloudflare { interface Env;",
  "declare namespace Cloudflare { interface Env { ROOM: string;",
  "declare namespace Cloudflare { interface Env { @bad } }",
])("reports unknown or incomplete generated type syntax: %s", (source) => {
  expect(() => environmentBindings(source)).toThrow(Unconfirmed);
});
