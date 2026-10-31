import tseslint from 'typescript-eslint';

// A first correctness/security gate for this existing codebase; formatting is not changed.
export default [
 {ignores:['.next/**','.local/**','.release/**','node_modules/**','next-env.d.ts']},
 {files:['**/*.ts','**/*.tsx'],languageOptions:{parser:tseslint.parser,ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},rules:{
  'constructor-super':'error','for-direction':'error','getter-return':'error',
  'no-async-promise-executor':'error','no-debugger':'error','no-dupe-args':'error',
  'no-dupe-class-members':'error','no-dupe-else-if':'error','no-dupe-keys':'error',
  'no-duplicate-case':'error','no-ex-assign':'error','no-import-assign':'error',
  'no-invalid-regexp':'error','no-loss-of-precision':'error','no-promise-executor-return':'error',
  'no-self-assign':'error','no-self-compare':'error','no-sparse-arrays':'error',
  'no-unexpected-multiline':'error','no-unreachable':'error','no-unsafe-finally':'error',
  'no-unsafe-negation':'error','no-eval':'error','no-implied-eval':'error','no-new-func':'error',
  'use-isnan':'error','valid-typeof':'error'
 }}
];
