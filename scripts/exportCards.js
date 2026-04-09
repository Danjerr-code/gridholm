import { CARD_DB } from '../src/engine/cards.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ATTRIBUTE_ORDER = ['light', 'primal', 'mystic', 'dark', 'neutral'];
const TYPE_ORDER = ['unit', 'spell', 'relic', 'omen', 'terrain'];

const ATTRIBUTE_LABELS = {
  light: 'Light',
  primal: 'Primal',
  mystic: 'Mystic',
  dark: 'Dark',
  neutral: 'Neutral',
};

const TYPE_LABELS = {
  unit: 'Unit',
  spell: 'Spell',
  relic: 'Relic',
  omen: 'Omen',
  terrain: 'Terrain',
};

function formatStat(val) {
  return val !== undefined && val !== null ? String(val) : '-';
}

function cardRow(card) {
  const id = card.id;
  const name = card.name;
  const attribute = ATTRIBUTE_LABELS[card.attribute] ?? card.attribute ?? '-';
  const type = TYPE_LABELS[card.type] ?? card.type ?? '-';
  const cost = formatStat(card.cost);
  const atk = formatStat(card.atk);
  const hp = formatStat(card.hp);
  const spd = formatStat(card.spd);
  const rules = (card.rules ?? '').replace(/\|/g, '\\|');
  return `| ${id} | ${name} | ${attribute} | ${type} | ${cost} | ${atk} | ${hp} | ${spd} | ${rules} |`;
}

const allCards = Object.values(CARD_DB);

// Separate tokens from non-tokens
const tokens = allCards.filter(c => c.token === true || c.isToken === true);
const mainCards = allCards.filter(c => !c.token && !c.isToken);

// Sort main cards: by attribute order, then type order, then cost
mainCards.sort((a, b) => {
  const attrA = ATTRIBUTE_ORDER.indexOf(a.attribute);
  const attrB = ATTRIBUTE_ORDER.indexOf(b.attribute);
  if (attrA !== attrB) return attrA - attrB;

  const typeA = TYPE_ORDER.indexOf(a.type);
  const typeB = TYPE_ORDER.indexOf(b.type);
  if (typeA !== typeB) return typeA - typeB;

  return (a.cost ?? 0) - (b.cost ?? 0);
});

const header = `| ID | Name | Attribute | Type | Cost | ATK | HP | SPD | Rules |
|---|---|---|---|---|---|---|---|---|`;

const mainRows = mainCards.map(cardRow).join('\n');
const tokenRows = tokens.map(cardRow).join('\n');

const output = `# Gridholm Card Export

${header}
${mainRows}

## Tokens

${header}
${tokenRows}
`;

const outPath = join(__dirname, 'card-export.md');
writeFileSync(outPath, output, 'utf-8');
console.log(`Exported ${mainCards.length} cards and ${tokens.length} tokens to ${outPath}`);
