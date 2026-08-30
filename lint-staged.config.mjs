// Pre-commit: rápido, SOLO sobre archivos en stage.
//  - `eslint --fix` por archivo. Bloquea en 'error' (import/no-unresolved,
//    prefer-const, no-redeclare, …); NO bloquea en los ~640 warnings preexistentes.
//
// El typecheck completo + tests + `next build` + smoke NO van aquí (serían
// minutos en un árbol grande): van en el hook `pre-push` vía `npm run verify`.
export default {
  '*.{ts,tsx,js,mjs,cjs}': (files) => [`eslint --fix ${files.map((f) => JSON.stringify(f)).join(' ')}`],
}
