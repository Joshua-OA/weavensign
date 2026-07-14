import * as t from "@babel/types";
import type { CssDeclaration } from "@weavensign/renderer-shared";

const CSS_PROP_TO_JS_PROP: Record<string, string> = {
  "background-color": "backgroundColor",
  "background-image": "backgroundImage",
  "border-radius": "borderRadius",
  "box-shadow": "boxShadow",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-style": "fontStyle",
  "font-weight": "fontWeight",
  "letter-spacing": "letterSpacing",
  "line-height": "lineHeight",
  "mix-blend-mode": "mixBlendMode",
  "text-align": "textAlign",
  "text-decoration": "textDecoration",
  "text-transform": "textTransform",
};

/** Converts a kebab-case CSS property name to the camelCase key React's inline style object expects (identical rule React itself documents: any hyphenated CSS property becomes camelCase, vendor prefixes aside). */
function jsPropName(cssProp: string): string {
  return CSS_PROP_TO_JS_PROP[cssProp] ?? cssProp;
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
