import { useEffect, useState } from 'react';
import {
  getActiveChallenges,
  getChallengeProgress,
  ensureChallengeProgress,
  markChallengesViewed,
  getDailySeed,
  getWeeklySeed,
} from '../challenges/challengeManager.js';

function getTimeUntilDailyReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const ms = tomorrow - now;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function getTimeUntilWeeklyReset() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  const ms = nextMonday - now;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function ProgressBar({ current, target, completed }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div style={{ background: '#1a1a2a', borderRadius: '3px', height: '6px', width: '100%', overflow: 'hidden', marginTop: '6px' }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: completed ? '#4ade80' : 'linear-gradient(90deg, #C9A84C, #e6c76a)',
          borderRadius: '3px',
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}

function ChallengeCard({ challenge, progress, isWeekly }) {
  const { current = 0, target = challenge.requirement.target ?? 1, completed = false } = progress || {};
  const borderColor = completed ? '#4ade8040' : isWeekly ? '#a855f740' : '#C9A84C30';
  const glowColor = completed ? '#4ade8020' : 'transparent';

  return (
    <div
      style={{
        background: completed ? '#0d1a0d' : '#0f0f1e',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        padding: '14px 16px',
        boxShadow: completed ? `0 0 8px ${glowColor}` : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            fontWeight: 600,
            color: completed ? '#4ade80' : isWeekly ? '#c084fc' : '#C9A84C',
            letterSpacing: '0.04em',
            marginBottom: '3px',
          }}>
            {isWeekly && <span style={{ fontSize: '10px', background: '#3b1d6e', padding: '1px 5px', borderRadius: '2px', marginRight: '6px', verticalAlign: 'middle' }}>WEEKLY</span>}
            {challenge.title}
          </div>
          <div style={{ fontSize: '12px', color: '#a0a0c0', lineHeight: 1.4 }}>
            {challenge.description}
          </div>
        </div>
        {completed && (
          <div style={{ fontSize: '18px', flexShrink: 0 }}>✓</div>
        )}
      </div>
      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', color: completed ? '#4ade80' : '#6a6a9a' }}>
          {current} / {target}
        </div>
        {completed && (
          <div style={{ fontSize: '10px', color: '#4ade80', fontFamily: "'Cinzel', serif", letterSpacing: '0.06em' }}>
            COMPLETE
          </div>
        )}
      </div>
      <ProgressBar current={current} target={target} completed={completed} />
    </div>
  );
}

export default function ChallengesScreen({ onBack }) {
  const [challenges, setChallenges] = useState(null);
  const [progress, setProgress] = useState({});

  useEffect(() => {
    ensureChallengeProgress();
    const active = getActiveChallenges();
    const prog = getChallengeProgress();
    setChallenges(active);
    setProgress(prog);
    markChallengesViewed();
  }, []);

  if (!challenges) return null;

  const { daily, weekly } = challenges;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px',
      fontFamily: 'var(--font-sans, sans-serif)',
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6a6a9a',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontFamily: 'inherit',
            }}
          >
            ← Back
          </button>
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '20px',
            fontWeight: 600,
            color: '#C9A84C',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            flex: 1,
            textAlign: 'center',
            margin: 0,
          }}>
            Challenges
          </h1>
          <div style={{ width: '48px' }} />
        </div>

        {/* Daily Section */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C80', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Daily Challenges
            </div>
            <div style={{ fontSize: '10px', color: '#4a4a6a' }}>
              Resets in {getTimeUntilDailyReset()}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {daily.map(ch => (
              <ChallengeCard
                key={ch.id}
                challenge={ch}
                progress={progress[ch.id]}
                isWeekly={false}
              />
            ))}
          </div>
        </div>

        {/* Weekly Section */}
        {weekly && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#c084fc80', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Weekly Challenge
              </div>
              <div style={{ fontSize: '10px', color: '#4a4a6a' }}>
                Resets in {getTimeUntilWeeklyReset()}
              </div>
            </div>
            <ChallengeCard
              challenge={weekly}
              progress={progress[weekly.id]}
              isWeekly={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
