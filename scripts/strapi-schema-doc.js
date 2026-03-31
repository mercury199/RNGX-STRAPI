#!/usr/bin/env node
/**
 * strapi-schema-doc.js
 *
 * Generates a detailed Markdown schema document (with Mermaid ER diagram)
 * from a Strapi v4/v5 src/api/ directory.
 *
 * Usage:
 *   node strapi-schema-doc.js <path-to-src/api>
 *                             [--extensions <path-to-src/extensions>]
 *                             [--components <path-to-src/components>]
 *                             [--output <output-file.md>]
 *
 * Examples:
 *   node strapi-schema-doc.js ./src/api --output schema.md
 *   node strapi-schema-doc.js ./RNGX/src/api \
 *     --extensions ./RNGX/src/extensions \
 *     --components ./RNGX/src/components \
 *     --output ./RNGX/SCHEMA_GENERATED.md
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const apiDir        = args.find(a => !a.startsWith('--'));
const extensionsDir = getArg('--extensions');
const componentsDir = getArg('--components');
const outputFile    = getArg('--output') || 'strapi-schema.md';

if (!apiDir) {
  console.error('Usage: node strapi-schema-doc.js <path-to-src/api> [--extensions <path>] [--components <path>] [--output <file.md>]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function walkDir(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, predicate));
    } else if (predicate(entry.name, full)) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Schema discovery
// ---------------------------------------------------------------------------

/**
 * Find all content-type schema.json files under a src/api directory.
 * Pattern: <apiDir>/<name>/content-types/<name>/schema.json
 */
function discoverApiSchemas(dir) {
  return walkDir(dir, (name) => name === 'schema.json')
    .filter(f => f.includes(`${path.sep}content-types${path.sep}`));
}

/**
 * Find extension schemas (e.g. users-permissions user override).
 * Pattern: <extensionsDir>/<plugin>/content-types/<name>/schema.json
 */
function discoverExtensionSchemas(dir) {
  if (!dir) return [];
  return walkDir(dir, (name) => name === 'schema.json')
    .filter(f => f.includes(`${path.sep}content-types${path.sep}`));
}

/**
 * Find all component JSON files under a src/components directory.
 * Pattern: <componentsDir>/<category>/<name>.json
 */
function discoverComponents(dir) {
  if (!dir) return [];
  return walkDir(dir, (name) => name.endsWith('.json'));
}

// ---------------------------------------------------------------------------
// Attribute classification helpers
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set([
  'string', 'text', 'richtext', 'email', 'password', 'uid',
  'integer', 'biginteger', 'float', 'decimal',
  'date', 'datetime', 'time', 'timestamp',
  'boolean', 'json', 'enumeration', 'blocks',
]);

function isRelation(attr) { return attr.type === 'relation'; }
function isComponent(attr) { return attr.type === 'component'; }
function isDynamiczone(attr) { return attr.type === 'dynamiczone'; }
function isMedia(attr) { return attr.type === 'media'; }
function isScalar(attr) { return SCALAR_TYPES.has(attr.type); }

function attrNotes(name, attr) {
  const notes = [];
  if (attr.required) notes.push('Required');
  if (attr.unique)   notes.push('Unique');
  if (attr.private)  notes.push('Private');
  if (attr.configurable === false) notes.push('System (non-configurable)');
  if (attr.default !== undefined)  notes.push(`Default: \`${attr.default}\``);
  if (attr.minLength !== undefined) notes.push(`Min length: ${attr.minLength}`);
  if (attr.maxLength !== undefined) notes.push(`Max length: ${attr.maxLength}`);
  if (attr.min !== undefined)      notes.push(`Min: ${attr.min}`);
  if (attr.max !== undefined)      notes.push(`Max: ${attr.max}`);
  if (attr.regex)                  notes.push(`Regex: \`${attr.regex}\``);
  if (attr.targetField)            notes.push(`Generated from: \`${attr.targetField}\``);
  if (attr.multiple === true)      notes.push('Multiple');
  if (attr.multiple === false)     notes.push('Single');
  if (attr.allowedTypes)           notes.push(`Allowed: ${attr.allowedTypes.join(', ')}`);
  if (attr.enum)                   notes.push(`Values: ${attr.enum.map(v => `\`${v}\``).join(', ')}`);
  if (attr.repeatable !== undefined) notes.push(attr.repeatable ? 'Repeatable' : 'Single');
  if (attr.pluginOptions?.i18n?.localized) notes.push('i18n localized');
  if (attr.conditions?.visible)    notes.push('Conditionally visible');
  if (attr.searchable === false)   notes.push('Not searchable');
  return notes.join(' · ') || '—';
}

// ---------------------------------------------------------------------------
// Markdown builders
// ---------------------------------------------------------------------------

function mdTable(headers, rows) {
  const lines = [];
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
  for (const row of rows) {
    lines.push('| ' + row.map(c => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function buildContentTypeSection(schema, sourceLabel) {
  const { kind, collectionName, info, options, pluginOptions, attributes } = schema;
  const displayName = info.displayName || info.name || collectionName;
  const singular    = info.singularName || collectionName;
  const plural      = info.pluralName   || collectionName;
  const draftPublish = options?.draftAndPublish ? 'Yes' : 'No';
  const i18n         = pluginOptions?.i18n?.localized ? '**Yes**' : 'No';

  const lines = [];
  const anchor = displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  lines.push(`### ${displayName}`);
  lines.push('');
  lines.push(`**Source:** \`${sourceLabel}\` | **Collection:** \`${collectionName}\` | **Kind:** ${kind} | **Draft & Publish:** ${draftPublish} | **i18n:** ${i18n}`);
  lines.push('');

  // Scalar / media / dynamiczone fields
  const fieldRows = [];
  const relationRows = [];
  const componentRows = [];

  for (const [name, attr] of Object.entries(attributes || {})) {
    if (isRelation(attr)) {
      const inv = attr.inversedBy || attr.mappedBy || '—';
      relationRows.push([
        `\`${name}\``,
        attr.relation,
        `\`${attr.target}\``,
        inv === '—' ? '—' : `\`${inv}\``,
        attrNotes(name, attr),
      ]);
    } else if (isComponent(attr)) {
      componentRows.push([
        `\`${name}\``,
        `\`${attr.component}\``,
        attr.repeatable ? 'Yes' : 'No',
        attrNotes(name, attr),
      ]);
    } else if (isDynamiczone(attr)) {
      const comps = (attr.components || []).map(c => `\`${c}\``).join(', ');
      fieldRows.push([`\`${name}\``, 'dynamiczone', attrNotes(name, attr) + (comps ? ` · Components: ${comps}` : '')]);
    } else {
      fieldRows.push([`\`${name}\``, attr.type, attrNotes(name, attr)]);
    }
  }

  if (fieldRows.length > 0) {
    lines.push('#### Fields');
    lines.push('');
    lines.push(mdTable(['Field', 'Type', 'Notes'], fieldRows));
    lines.push('');
  }

  if (relationRows.length > 0) {
    lines.push('#### Relations');
    lines.push('');
    lines.push(mdTable(['Field', 'Relation Type', 'Target', 'Inverse Field', 'Notes'], relationRows));
    lines.push('');
  }

  if (componentRows.length > 0) {
    lines.push('#### Components');
    lines.push('');
    lines.push(mdTable(['Field', 'Component', 'Repeatable', 'Notes'], componentRows));
    lines.push('');
  }

  return lines.join('\n');
}

function buildComponentSection(schema, filePath) {
  const { collectionName, info, attributes } = schema;
  const displayName = info.displayName || info.name || collectionName;

  // Derive the component key from the file path: <category>/<name>.json
  const parts   = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1].replace('.json', '');
  const category = parts[parts.length - 2] || 'shared';
  const componentKey = `${category}.${fileName}`;

  const lines = [];
  lines.push(`### \`${componentKey}\``);
  lines.push('');
  lines.push(`**Display Name:** ${displayName} | **Collection:** \`${collectionName}\``);
  lines.push('');

  const rows = [];
  for (const [name, attr] of Object.entries(attributes || {})) {
    rows.push([`\`${name}\``, attr.type, attrNotes(name, attr)]);
  }

  if (rows.length > 0) {
    lines.push(mdTable(['Field', 'Type', 'Notes'], rows));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Mermaid ER diagram builder
// ---------------------------------------------------------------------------

/**
 * Sanitize a display name to a valid Mermaid entity name (PascalCase, no spaces/special chars).
 */
function toEntityName(str) {
  return str
    .replace(/[^a-zA-Z0-9\s_]/g, '')
    .split(/[\s_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/**
 * Map Strapi relation types to Mermaid cardinality strings.
 * Left side = this entity, Right side = target entity.
 */
function mermaidCardinality(relType, side) {
  // side: 'left' (from this entity's perspective) or 'right' (target)
  switch (relType) {
    case 'oneToOne':   return side === 'left' ? '||' : '||';
    case 'oneToMany':  return side === 'left' ? '||' : 'o{';
    case 'manyToOne':  return side === 'left' ? 'o{' : '||';
    case 'manyToMany': return side === 'left' ? '}o' : 'o{';
    default:           return side === 'left' ? '||' : '||';
  }
}

function buildMermaidDiagram(schemas) {
  const entities   = new Map(); // entityName -> { fields: [], attrs: {} }
  const apiIdToName = new Map(); // apiId -> entityName

  // First pass: register all entities
  for (const { schema } of schemas) {
    const { info, attributes } = schema;
    const displayName = info.displayName || info.name || info.singularName || 'Unknown';
    const eName = toEntityName(displayName);
    const apiId = `api::${info.singularName}.${info.singularName}`;
    apiIdToName.set(apiId, eName);
    // Also register plugin user
    if (info.singularName === 'user') {
      apiIdToName.set('plugin::users-permissions.user', eName);
    }
    entities.set(eName, { fields: [], attrs: attributes || {} });
  }

  // Collect scalar fields and relations
  const relations = []; // { from, to, label, relType }
  const seenRelations = new Set();

  for (const { schema } of schemas) {
    const { info, attributes } = schema;
    const displayName = info.displayName || info.name || info.singularName || 'Unknown';
    const eName = toEntityName(displayName);
    const entity = entities.get(eName);

    for (const [name, attr] of Object.entries(attributes || {})) {
      if (isScalar(attr) || isMedia(attr)) {
        // Only include non-system scalar fields
        if (attr.configurable === false && attr.private) continue;
        entity.fields.push({ name, type: attr.type });
      } else if (isRelation(attr)) {
        // Only emit each logical relation once (skip mappedBy side — inversedBy side owns it)
        if (attr.mappedBy) continue;

        const targetName = apiIdToName.get(attr.target);
        if (!targetName) continue;

        const relKey = [eName, targetName, name].sort().join('|');
        if (seenRelations.has(relKey)) continue;
        seenRelations.add(relKey);

        relations.push({ from: eName, to: targetName, label: name, relType: attr.relation });
      }
    }
  }

  const lines = [];
  lines.push('```mermaid');
  lines.push('erDiagram');

  // Emit entity blocks with scalar fields
  for (const [eName, { fields }] of entities) {
    if (fields.length === 0) {
      lines.push(`    ${eName} { }`);
    } else {
      lines.push(`    ${eName} {`);
      for (const { name, type } of fields.slice(0, 10)) { // cap at 10 to keep diagram readable
        lines.push(`        ${type} ${name}`);
      }
      lines.push('    }');
    }
  }

  lines.push('');

  // Emit relations
  for (const { from, to, label, relType } of relations) {
    const left  = mermaidCardinality(relType, 'left');
    const right = mermaidCardinality(relType, 'right');
    lines.push(`    ${from} ${left}--${right} ${to} : "${label}"`);
  }

  lines.push('```');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const resolvedApi = path.resolve(apiDir);
  console.log(`Scanning API directory: ${resolvedApi}`);

  // Discover schemas
  const apiSchemaPaths       = discoverApiSchemas(resolvedApi);
  const extensionSchemaPaths = discoverExtensionSchemas(extensionsDir ? path.resolve(extensionsDir) : null);
  const componentPaths       = discoverComponents(componentsDir ? path.resolve(componentsDir) : null);

  console.log(`Found ${apiSchemaPaths.length} API schema(s), ${extensionSchemaPaths.length} extension schema(s), ${componentPaths.length} component(s)`);

  // Load and label schemas
  const allSchemas = [];

  for (const filePath of apiSchemaPaths) {
    const schema = readJSON(filePath);
    if (!schema) { console.warn(`  Skipping unreadable: ${filePath}`); continue; }
    const parts  = filePath.replace(/\\/g, '/').split('/');
    const ctIdx  = parts.indexOf('content-types');
    const apiName = ctIdx > 0 ? parts[ctIdx - 1] : path.basename(path.dirname(path.dirname(filePath)));
    allSchemas.push({ schema, filePath, label: `api::${apiName}.${schema.info?.singularName || apiName}`, source: 'api' });
  }

  for (const filePath of extensionSchemaPaths) {
    const schema = readJSON(filePath);
    if (!schema) { console.warn(`  Skipping unreadable: ${filePath}`); continue; }
    const parts    = filePath.replace(/\\/g, '/').split('/');
    const extIdx   = parts.findIndex(p => p === 'extensions');
    const pluginName = extIdx !== -1 ? parts[extIdx + 1] : 'extension';
    allSchemas.push({ schema, filePath, label: `plugin::${pluginName}.${schema.info?.singularName || 'user'}`, source: 'extension' });
  }

  // Sort: singleTypes last, then alphabetically
  allSchemas.sort((a, b) => {
    if (a.schema.kind === 'singleType' && b.schema.kind !== 'singleType') return 1;
    if (a.schema.kind !== 'singleType' && b.schema.kind === 'singleType') return -1;
    return (a.schema.info?.displayName || '').localeCompare(b.schema.info?.displayName || '');
  });

  // Load components
  const components = [];
  for (const filePath of componentPaths) {
    const schema = readJSON(filePath);
    if (!schema) continue;
    components.push({ schema, filePath });
  }
  components.sort((a, b) => (a.filePath).localeCompare(b.filePath));

  // -------------------------------------------------------------------------
  // Build markdown
  // -------------------------------------------------------------------------

  const out = [];

  // Title
  out.push(`# Strapi Schema Reference`);
  out.push('');
  out.push(`> Auto-generated from \`${path.relative(process.cwd(), resolvedApi)}\` — **${allSchemas.length} content type(s)**, **${components.length} component(s)**`);
  out.push('');
  out.push('---');
  out.push('');

  // Table of contents
  out.push('## Table of Contents');
  out.push('');
  out.push('1. [Content Types Overview](#content-types-overview)');
  out.push('2. [Content Types](#content-types)');
  for (const { schema } of allSchemas) {
    const d = schema.info?.displayName || schema.info?.name || schema.collectionName || '?';
    const anchor = d.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    out.push(`   - [${d}](#${anchor})`);
  }
  if (components.length > 0) {
    out.push('3. [Shared Components](#shared-components)');
  }
  out.push('4. [Entity Relationship Diagram](#entity-relationship-diagram)');
  out.push('');
  out.push('---');
  out.push('');

  // Overview table
  out.push('## Content Types Overview');
  out.push('');
  const overviewRows = allSchemas.map(({ schema, label, source }) => {
    const displayName  = schema.info?.displayName || schema.info?.name || '?';
    const collName     = schema.collectionName || '?';
    const kind         = schema.kind || '?';
    const dp           = schema.options?.draftAndPublish ? 'Yes' : 'No';
    const i18n         = schema.pluginOptions?.i18n?.localized ? 'Yes' : 'No';
    const src          = source === 'extension' ? '*(extension)*' : '';
    return [displayName + (src ? ' ' + src : ''), `\`${label}\``, `\`${collName}\``, kind, dp, i18n];
  });
  out.push(mdTable(['Display Name', 'API ID', 'Collection Name', 'Kind', 'Draft & Publish', 'i18n'], overviewRows));
  out.push('');
  out.push('---');
  out.push('');

  // Per content type sections
  out.push('## Content Types');
  out.push('');
  out.push('---');
  out.push('');

  for (const { schema, label } of allSchemas) {
    out.push(buildContentTypeSection(schema, label));
    out.push('---');
    out.push('');
  }

  // Components
  if (components.length > 0) {
    out.push('## Shared Components');
    out.push('');
    out.push('---');
    out.push('');
    for (const { schema, filePath } of components) {
      out.push(buildComponentSection(schema, filePath));
      out.push('---');
      out.push('');
    }
  }

  // Mermaid ER diagram
  out.push('## Entity Relationship Diagram');
  out.push('');
  out.push('> Rendered with [Mermaid](https://mermaid.js.org/). View in GitHub, VS Code, or [mermaid.live](https://mermaid.live).');
  out.push('');
  out.push(buildMermaidDiagram(allSchemas));
  out.push('');

  // Write output
  const resolvedOutput = path.resolve(outputFile);
  fs.writeFileSync(resolvedOutput, out.join('\n'), 'utf8');
  console.log(`\nSchema document written to: ${resolvedOutput}`);
}

main();
