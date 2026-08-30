import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ── Reactivación por fases (2026-08) ──────────────────────────────────
    // Objetivo: subir estas a "error" a medida que se limpia el conteo.
    // Por ahora "warn" para no bloquear CI mientras se reduce la deuda.
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "react-hooks/exhaustive-deps": "warn",
    "no-empty": ["warn", { allowEmptyCatch: true }],
    "no-fallthrough": "warn",

    // ── Ya en "error": bajo costo, alto valor, sin violaciones actuales ──
    "prefer-const": "error",
    "no-redeclare": "error",
    "no-unreachable": "error",
    "@typescript-eslint/prefer-as-const": "error",

    // ── Resolución de imports: atrapa rutas/módulos rotos en el editor y en CI,
    //    no solo cuando Turbopack falla el build. `import/named` queda apagada
    //    porque `tsc` ya valida los named imports en .ts/.tsx y da falsos
    //    positivos con paquetes que usan `export type` (p.ej. class-variance-authority). ──
    "import/named": "off",
    "import/no-unresolved": "error",
    "import/no-duplicates": "warn",

    // ── Se mantienen apagadas (ruido o cubiertas por TS/estilo) ──
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-undef": "off",
    "no-useless-escape": "off",
  },
}, {
  // Resolver de imports: usa tsconfig para los alias `@/*` y `@data/*`.
  settings: {
    "import/resolver": {
      typescript: { project: "./tsconfig.json" },
      node: true,
    },
  },
}, {
  ignores: ["node_modules/**", ".next/**", ".next-snapshot/**", ".turbo/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "mini-services/**", "scripts/**", "test/**", "prisma/**", "*.config.*", "daemon.js", "daemon-prod.js", "keepalive.cjs", "start-server.js"]
}];

export default eslintConfig;
