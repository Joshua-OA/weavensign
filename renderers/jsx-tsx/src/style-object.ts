import * as t from "@babel/types";
import type { CssDeclaration } from "@weavensign/renderer-shared";

/**
 * Converts a kebab-case CSS property name to the camelCase key React's inline style
 * object expects (identical rule React itself documents: any hyphenated CSS property
 * becomes camelCase, vendor prefixes aside). A generic conversion, not a hand-maintained
 * lookup table — the earlier lookup-table version silently produced wrong output
 * (kebab-case bracket-quoted keys, e.g. `"background-size"`, instead of
 * `backgroundSize`) the moment `renderer-shared` gained a property no one remembered to
 * add to the table (background-size/background-repeat, added for resolved image-fill
 * URLs) — a maintenance burden a general conversion doesn't have.
 */
function jsPropName(cssProp: string): string {
  return cssProp.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/**
 * Converts a CssDeclaration[] (the same format-agnostic shape `@weavensign/renderer-shared`
 * produces for the HTML/CSS renderer) into a Babel ObjectExpression AST node suitable for a
 * JSX `style={{...}}` attribute. Every declaration's value is already a valid CSS-syntax
 * string (e.g. "12px", "rgb(255, 0, 0)") from renderer-shared's formatting helpers — React
 * accepts CSS-syntax strings for style values, so no further conversion is needed beyond
 * the property-name casing.
 */
export function declarationsToStyleObject(declarations: CssDeclaration[]): t.ObjectExpression {
  const properties = declarations.map((declaration) =>
    t.objectProperty(t.stringLiteral(jsPropName(declaration.prop)), t.stringLiteral(declaration.value)),
  );
  return t.objectExpression(properties);
}
