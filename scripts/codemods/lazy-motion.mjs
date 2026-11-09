#!/usr/bin/env node
/**
 * One-shot codemod for issue #200: framer-motion's `motion` → `m`.
 *
 *   node scripts/codemods/lazy-motion.mjs            rewrite src/ in place
 *   node scripts/codemods/lazy-motion.mjs --check    exit 1 if anything is left to rewrite
 *
 * `motion.*` carries every animation feature into the first load. `m.*`
 * renders with a small core and takes its features from the `<LazyMotion>` in
 * src/components/MotionPreferences.jsx, which loads them asynchronously. This
 * script makes the switch mechanically, so 383 JSX sites are a reviewable
 * transform rather than 383 hand edits:
 *
 *   import { motion } from 'framer-motion'  →  import { m } from 'framer-motion'
 *   <motion.div> … </motion.div>            →  <m.div> … </m.div>
 *   motion(Component)                       →  m.create(Component)
 *   motion[tag], motion.create(X)           →  m[tag], m.create(X)
 *
 * It parses each file with Babel and rewrites only identifiers that RESOLVE to
 * the framer import (scope-checked), by character offset, so formatting and
 * comments are untouched. It refuses a file where `m` is already bound in a
 * scope a rewritten site would sit in (`items.map((m) => <motion.li/>)` would
 * otherwise silently capture the wrong `m`) and reports it instead.
 *
 * Kept after the migration as the record of how the diff was produced;
 * tests/fitness/lazyMotion.test.js is what keeps `motion` out from now on.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default ?? traverseModule;
const check = process.argv.includes('--check');
const ROOT = path.resolve('src');

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(m?js|jsx)$/.test(name) ? [p] : [];
  });

function transform(file, code) {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
  const edits = [];
  const problems = [];
  let importBinding = null;
  let local = null;

  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value !== 'framer-motion') return;
      const specs = p.node.specifiers;
      const spec = specs.find((s) => s.type === 'ImportSpecifier' && s.imported.name === 'motion');
      if (!spec) return;
      local = spec.local.name;
      importBinding = p.scope.getBinding(local);
      const alreadyHasM = specs.some((s) => s.type === 'ImportSpecifier' && s.imported.name === 'm');
      if (alreadyHasM) {
        // Drop the `motion` specifier and its separating comma.
        const i = specs.indexOf(spec);
        const next = specs[i + 1];
        const prev = specs[i - 1];
        if (next) edits.push([spec.start, next.start, '']);
        else edits.push([prev.end, spec.end, '']);
      } else if (local === 'motion') {
        edits.push([spec.start, spec.end, 'm']);
      } else {
        edits.push([spec.imported.start, spec.imported.end, 'm']);
      }
    },
  });
  if (!importBinding) return { code, changed: false, problems };

  const next = local === 'motion' ? 'm' : local;
  if (next === 'm' && ast.program && importBinding.scope.getBinding('m') && importBinding.scope.getBinding('m') !== importBinding) {
    problems.push(`${file}: module scope already binds \`m\``);
  }

  const visit = (p) => {
    if (p.node.name !== local) return;
    const parent = p.parent;
    // Not a reference: property names, object keys, attribute names, the specifier itself.
    if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === p.node && !parent.computed) return;
    if (parent.type === 'JSXMemberExpression' && parent.property === p.node) return;
    if ((parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && parent.key === p.node && !parent.computed && !parent.shorthand) return;
    if (parent.type === 'JSXAttribute' || parent.type.startsWith('Import')) return;
    if (p.scope.getBinding(local) !== importBinding) return;

    const mBinding = p.scope.getBinding('m');
    if (next === 'm' && mBinding && mBinding !== importBinding) {
      problems.push(`${file}:${p.node.loc.start.line}: \`m\` is shadowed here`);
      return;
    }
    if (parent.type === 'CallExpression' && parent.callee === p.node) {
      edits.push([p.node.start, p.node.end, `${next}.create`]);
    } else if (parent.type === 'JSXMemberExpression' || parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') {
      if (next !== local) edits.push([p.node.start, p.node.end, next]);
    } else {
      problems.push(`${file}:${p.node.loc.start.line}: \`${local}\` used as a bare value (${parent.type}); rewrite by hand`);
    }
  };
  traverse(ast, { Identifier: visit, JSXIdentifier: visit });

  if (problems.length) return { code, changed: false, problems };
  let out = code;
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + text + out.slice(end);
  return { code: out, changed: out !== code, problems };
}

let changedFiles = 0;
const allProblems = [];
for (const file of walk(ROOT)) {
  const code = readFileSync(file, 'utf8');
  if (!code.includes('framer-motion')) continue;
  const rel = path.relative(process.cwd(), file);
  const { code: out, changed, problems } = transform(rel, code);
  allProblems.push(...problems);
  if (!changed) continue;
  changedFiles += 1;
  if (check) console.log(`would rewrite ${rel}`);
  else writeFileSync(file, out);
}

if (allProblems.length) {
  console.error(allProblems.join('\n'));
  process.exit(2);
}
console.log(`${check ? 'would rewrite' : 'rewrote'} ${changedFiles} file(s)`);
if (check && changedFiles) process.exit(1);
