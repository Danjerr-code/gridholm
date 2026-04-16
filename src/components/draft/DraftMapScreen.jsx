/**
 * DraftMapScreen
 * --------------
 * Displays the 29-node branching draft map.
 *
 * Props:
 *   draftMap         — map object from generateDraftMap()
 *   mapPosition      — 0-based index into the traversal path (current position)
 *   committedBranch  — 'A'|'B'|'C'|'D' or null (pre-fork)
 *   primaryFaction
 *   secondaryFaction
 *   nextBuckets      — array of 4 bucket IDs for the upcoming node (to preview labels)
 *   onContinue       — called when player taps "Continue to Node"
 */

import { BRANCHES, getDraftPath, getNodeId, SPECIAL_TYPES } from '../../draft/draftMap.js';
import { BUCKET_LABELS, BUCKET_DESCRIPTIONS } from '../../draft/draftBuckets.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { ATTR_SYMBOLS } from '../../assets/attributeSymbols.jsx';
import DraftCurvePanel from './DraftCurvePanel.jsx';

const BRANCH_LABELS = {
  primary_faction:   'Primary',
  secondary_faction: 'Secondary',
  swap:              'Swap',
  rare:              'Rare',
};

const BRANCH_ICONS = {
  primary_faction:   '★',
  secondary_faction: '◆',
  swap:              '⇄',
  rare:              '✦',
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const scrn = {
  minHeight: '100vh',
  background: '#0a0a0f',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '16px',
  overflowY: 'auto',
};

const heading = {
  fontFamily: "'Cinzel', serif",
  color: '#C9A84C',
  letterSpacing: '0.15em',
  margin: 0,
};

export default function DraftMapScreen({
  draftMap,
  mapPosition,
  committedBranch,
  primaryFaction,
  secondaryFaction,
  draftedIds,
  nextBuckets,
  onContinue,
}) {
  const path = getDraftPath(committedBranch);
  const currentNodeId = path[mapPosition];
  const currentNode = draftMap.nodes[currentNodeId];

  const factionColor = (f) => ATTRIBUTES[f]?.color ?? '#C9A84C';
  const primColor = factionColor(primaryFaction);
  const secColor  = factionColor(secondaryFaction);

  return (
    <div style={scrn}>
      <div style={{ maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ ...heading, fontSize: 18 }}>DRAFT MAP</h2>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: '#C9A84C' }}>
            Node {mapPosition + 1} / 29
          </span>
        </div>

        {/* Faction tags */}
        <div style={{ display: 'flex', gap: 8 }}>
          <FactionTag color={primColor} label={ATTRIBUTES[primaryFaction]?.name ?? primaryFaction} />
          <FactionTag color={secColor}  label={ATTRIBUTES[secondaryFaction]?.name ?? secondaryFaction} />
        </div>

        {/* Map visual */}
        <MapVisual
          draftMap={draftMap}
          mapPosition={mapPosition}
          committedBranch={committedBranch}
          primaryFaction={primaryFaction}
          secondaryFaction={secondaryFaction}
          path={path}
        />

        {/* Deck curve and type counters */}
        <DraftCurvePanel draftedIds={draftedIds} />

        {/* Next node preview */}
        {nextBuckets && (
          <NextNodePreview buckets={nextBuckets} nodeType={currentNode?.type} />
        )}

        {/* Continue button */}
        <button
          style={btnPrimary}
          onClick={onContinue}
        >
          {currentNode?.type === 'fork' ? 'Choose Branch →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

// ── Map Visual ────────────────────────────────────────────────────────────────

function MapVisual({ draftMap, mapPosition, committedBranch, primaryFaction, secondaryFaction, path }) {
  const { branchSpecialTypes } = draftMap;

  // Pre-fork row: nodes 1-7
  const preforkNodes = [];
  for (let i = 0; i < 7; i++) {
    preforkNodes.push({ pos: i, nodeId: `node_${i + 1}`, position: i + 1 });
  }

  // Fork node
  const forkNodeId = 'node_8';

  // Branch rows: nodes 9-29 per branch, each branch is a row
  const branchRows = BRANCHES.map(branch => {
    const nodes = [];
    for (let pos = 9; pos <= 29; pos++) {
      nodes.push({ pos: pos - 1, nodeId: `node_${pos}_${branch}`, position: pos, branch });
    }
    return { branch, nodes, specialType: branchSpecialTypes[branch] };
  });

  // Current position in path
  const currentNodeId = path[mapPosition] ?? null;
  // Set of visited node IDs
  const visitedSet = new Set(path.slice(0, mapPosition).map((_, i) => path[i]));
  // All completed node IDs (visited AND player has passed through)
  const completedSet = new Set(path.slice(0, mapPosition));

  // Determine active branch highlight
  const activeBranch = committedBranch;

  return (
    <div style={{
      background: '#0d0d1a',
      border: '1px solid #1e1e30',
      borderRadius: 8,
      padding: 12,
      overflowX: 'auto',
    }}>
      {/* Pre-fork row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8 }}>
        {preforkNodes.map(({ pos, nodeId, position }, i) => (
          <div key={nodeId} style={{ display: 'flex', alignItems: 'center' }}>
            <MapNode
              nodeId={nodeId}
              position={position}
              type="standard"
              specialType={null}
              isCurrent={nodeId === currentNodeId}
              isCompleted={completedSet.has(nodeId)}
              isActive={true}
              buckets={draftMap.nodes[nodeId]?.buckets}
            />
            {i < preforkNodes.length - 1 && <Connector active={true} />}
          </div>
        ))}
        <Connector active={true} />
        {/* Fork node */}
        <MapNode
          nodeId={forkNodeId}
          position={8}
          type="fork"
          specialType={null}
          isCurrent={forkNodeId === currentNodeId}
          isCompleted={completedSet.has(forkNodeId)}
          isActive={true}
          buckets={draftMap.nodes[forkNodeId]?.buckets}
        />
      </div>

      {/* Branch rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 8 }}>
        {branchRows.map(({ branch, nodes, specialType }) => {
          const isCommitted = activeBranch === branch;
          const isPossible = activeBranch == null || isCommitted;
          return (
            <BranchRow
              key={branch}
              branch={branch}
              nodes={nodes}
              specialType={specialType}
              primaryFaction={primaryFaction}
              secondaryFaction={secondaryFaction}
              currentNodeId={currentNodeId}
              completedSet={completedSet}
              isActive={isPossible}
              isCommitted={isCommitted}
              mapNodes={draftMap.nodes}
            />
          );
        })}
      </div>
    </div>
  );
}

function BranchRow({ branch, nodes, specialType, primaryFaction, secondaryFaction, currentNodeId, completedSet, isActive, isCommitted, mapNodes }) {
  const branchLabel = BRANCH_LABELS[specialType] ?? specialType;
  const branchIcon  = BRANCH_ICONS[specialType] ?? '?';

  // For special node, figure out the faction color
  let specialColor = '#C9A84C';
  if (specialType === 'primary_faction') specialColor = ATTRIBUTES[primaryFaction]?.color ?? '#C9A84C';
  else if (specialType === 'secondary_faction') specialColor = ATTRIBUTES[secondaryFaction]?.color ?? '#C9A84C';
  else if (specialType === 'swap') specialColor = '#60a0e0';
  else if (specialType === 'rare') specialColor = '#e040d0';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      opacity: isActive ? 1 : 0.3,
      transition: 'opacity 300ms',
    }}>
      {/* Branch label */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        color: isCommitted ? specialColor : '#4a4a6a',
        minWidth: 44,
        textAlign: 'right',
        paddingRight: 6,
        letterSpacing: '0.05em',
      }}>
        {branchIcon} {branch}
      </div>

      {/* Connector from fork */}
      <Connector active={isActive} />

      {nodes.map(({ nodeId, position }, i) => {
        const node = mapNodes[nodeId];
        const type = node?.type ?? 'standard';
        const isSpecial = type === 'special';
        return (
          <div key={nodeId} style={{ display: 'flex', alignItems: 'center' }}>
            <MapNode
              nodeId={nodeId}
              position={position}
              type={type}
              specialType={node?.specialType}
              isCurrent={nodeId === currentNodeId}
              isCompleted={completedSet.has(nodeId)}
              isActive={isActive}
              specialColor={isSpecial ? specialColor : undefined}
              buckets={node?.buckets}
            />
            {i < nodes.length - 1 && <Connector active={isActive} />}
          </div>
        );
      })}

      {/* End label */}
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, color: specialColor, paddingLeft: 6, whiteSpace: 'nowrap' }}>
        {branchIcon} {branchLabel}
      </div>
    </div>
  );
}

function MapNode({ nodeId, position, type, specialType, isCurrent, isCompleted, isActive, specialColor, buckets }) {
  let size = 10;
  let bg = isCompleted ? '#2a2a4a' : '#1a1a2e';
  let border = '1px solid #2a2a4a';
  let content = null;

  if (type === 'fork') {
    size = 16;
    bg = isCompleted ? '#3a3a0a' : isCurrent ? '#8a6a00' : '#2a2a00';
    border = '1px solid #C9A84C88';
    content = <span style={{ fontSize: 7, color: '#C9A84C' }}>⑂</span>;
  } else if (type === 'special') {
    size = 14;
    const sc = specialColor ?? '#C9A84C';
    bg = isCompleted ? `${sc}33` : isCurrent ? `${sc}66` : `${sc}22`;
    border = `1px solid ${sc}88`;
    const icon = {
      primary_faction: '★', secondary_faction: '◆', swap: '⇄', rare: '✦'
    }[specialType] ?? '?';
    content = <span style={{ fontSize: 8, color: sc }}>{icon}</span>;
  } else {
    // Standard
    if (isCurrent) {
      bg = '#8a6a00';
      border = '1px solid #C9A84C';
    }
  }

  // Show bucket labels if this is the node 1 position away from current
  const showBuckets = false; // handled by NextNodePreview

  return (
    <div
      title={`Node ${position}${specialType ? ` (${specialType})` : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: type === 'fork' ? 3 : '50%',
        background: bg,
        border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 200ms',
      }}
    >
      {content}
    </div>
  );
}

function Connector({ active }) {
  return (
    <div style={{
      width: 6,
      height: 1,
      background: active ? '#2a2a4a' : '#1a1a2a',
      flexShrink: 0,
    }} />
  );
}

// ── Next Node Preview ─────────────────────────────────────────────────────────

function NextNodePreview({ buckets, nodeType }) {
  if (!buckets || buckets.length === 0) return null;
  return (
    <div style={{
      background: '#0d0d1a',
      border: '1px solid #1e1e30',
      borderRadius: 6,
      padding: '10px 12px',
    }}>
      <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', margin: '0 0 8px' }}>
        UPCOMING BUCKETS
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {buckets.map((bucketId, i) => (
          <div
            key={i}
            style={{
              background: '#141420',
              border: '1px solid #2a2a3a',
              borderRadius: 4,
              padding: '4px 8px',
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              color: bucketId === 'mystery' ? '#e0a0f0' : '#a0a0c0',
              letterSpacing: '0.04em',
            }}
          >
            {BUCKET_LABELS[bucketId] ?? bucketId}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Faction Tag ───────────────────────────────────────────────────────────────
function FactionTag({ color, label }) {
  return (
    <div style={{
      background: `${color}22`,
      border: `1px solid ${color}66`,
      borderRadius: 4,
      padding: '2px 8px',
      fontFamily: "'Cinzel', serif",
      fontSize: 11,
      color,
      letterSpacing: '0.06em',
    }}>
      {label}
    </div>
  );
}

// ── Button styles ─────────────────────────────────────────────────────────────
const btnPrimary = {
  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
  color: '#0a0a0f',
  fontFamily: "'Cinzel', serif",
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  borderRadius: 4,
  padding: '12px 24px',
  cursor: 'pointer',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  alignSelf: 'flex-end',
};
