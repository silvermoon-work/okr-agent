// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import renderer from "../src/renderer.js";
import { typescriptProjectSpec } from "../src/typescript-project.js";
import { validateCheckBundleSpec } from "../src/spec.js";

afterEach(() => {
  act(() => {
    renderer.dispose();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("optional routing annotation and browser renderer ABI", () => {
  it("accepts only the v2 annotation, including unannotated v2, and rejects unknown fields", () => {
    expect(validateCheckBundleSpec(typescriptProjectSpec).valid).toBe(true);
    expect(
      validateCheckBundleSpec({
        ...typescriptProjectSpec,
        $schema: "urn:ipfsaw:check-bundle:2",
      }).valid,
    ).toBe(true);
    expect(
      validateCheckBundleSpec({
        ...typescriptProjectSpec,
        $schema: "urn:wrong:1",
      }).valid,
    ).toBe(false);
    expect(
      validateCheckBundleSpec({ ...typescriptProjectSpec, unexpected: true })
        .valid,
    ).toBe(false);
  });
  it("mounts and updates the actual component and disposes its root", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const container = document.createElement("main");
    document.body.append(container);
    const selected = typescriptProjectSpec.checkpoints[1]!.id;
    window.history.replaceState(null, "", `#checkpoint=${selected}`);
    expect(() => {
      renderer.update({});
    }).toThrow("not mounted");
    act(() => {
      renderer.mount(container, {
        ...typescriptProjectSpec,
        $schema: "urn:ipfsaw:check-bundle:2",
      });
    });
    expect(container.textContent).toContain(typescriptProjectSpec.name);
    expect(container.querySelector(".cbv-fill > .cbv")).not.toBeNull();
    expect(container.querySelector(".cbv-identity > code")?.textContent).toBe(
      selected,
    );
    act(() => {
      renderer.update({ ...typescriptProjectSpec, name: "Updated document" });
    });
    expect(container.textContent).toContain("Updated document");
    expect(container.querySelector(".cbv-fill > .cbv")).not.toBeNull();
    expect(container.querySelector(".cbv-identity > code")?.textContent).toBe(
      selected,
    );
    act(() => {
      renderer.dispose();
    });
    expect(container.textContent).toBe("");
  });
});
