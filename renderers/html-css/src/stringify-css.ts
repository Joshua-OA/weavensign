import postcss from "postcss";
import type { CssDeclaration } from "./css-declarations.js";

/**
 * Builds one CSS rule (selector + declarations) as a deterministic string via postcss's
 * AST (not string concatenation) so output is always syntactically valid, per context.md
 * §3. Explicit `raws` on every node control whitespace/semicolon output directly — postcss's
 * own defaults aren't guaranteed stable across versions, and determinism (§4.7) requires
 * output that doesn't drift with an unrelated postcss patch release.
 */
export function stringifyRule(selector: string, declarations: CssDeclaration[]): string {
  const rule = postcss.rule({ selector, raws: { between: " ", after: "\n" } });
  for (const declaration of declarations) {
    rule.append(postcss.decl({ prop: declaration.prop, value: declaration.value, raws: { between: ": " } }));
  }
  rule.raws.semicolon = true;
  const root = postcss.root();
  root.append(rule);
  return root.toString();
}
