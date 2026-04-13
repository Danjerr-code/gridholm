/**
 * TutorialMenu.jsx
 *
 * Shows the 5 tutorial scenarios with title, description, and completion status.
 * Progress is stored in localStorage.
 */

import { useState } from 'react';
import { TUTORIAL_SCENARIOS } from '../tutorial/tutorialScenarios.js';
import TutorialController from '../tutorial/TutorialController.jsx';

const TUTORIAL_STORAGE_KEY = 'gridholm_tutorial_completed';

function loadCompleted() {
  try {
    return JSON.parse(localStorage.getItem(TUTORIAL_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function TutorialMenu({ onBack }) {
  const [completed, setCompleted] = useState(() => loadCompleted());
  const [activeScenario, setActiveScenario] = useState(null);

  function handleScenarioComplete(scenarioId) {
    const next = loadCompleted();
    setCompleted(next);
    setActiveScenario(null);
  }

  if (activeScenario) {
    return (
      <TutorialController
        scenario={activeScenario}
        onExit={() => setActiveScenario(null)}
        onComplete={handleScenarioComplete}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#e5e7eb',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        background: 'rgba(10,10,15,0.97)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        padding: '12px 24px',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            color: '#9ca3af',
            fontSize: '13px',
            padding: '6px 12px',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.target.style.color = '#fff'; }}
          onMouseLeave={e => { e.target.style.color = '#9ca3af'; }}
        >
          ← Back
        </button>
        <span style={{ fontFamily: "'Cinzel', serif", color: '#C9A84C', fontWeight: 600, fontSize: '14px', letterSpacing: '0.12em' }}>
          TUTORIAL
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#4a4a6a', letterSpacing: '0.08em' }}>
          {completed.length} / {TUTORIAL_SCENARIOS.length} COMPLETE
        </span>
      </div>

      {/* Scenario list */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 80px' }}>
        <p style={{
          fontFamily: "'Crimson Text', serif",
          fontStyle: 'italic',
          color: '#6a6a8a',
          fontSize: '15px',
          marginBottom: '28px',
          textAlign: 'center',
        }}>
          Learn Gridholm one concept at a time.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {TUTORIAL_SCENARIOS.map((scenario, idx) => {
            const done = completed.includes(scenario.id);
            return (
              <button
                key={scenario.id}
                onClick={() => setActiveScenario(scenario)}
                style={{
                  background: done
                    ? 'rgba(201,168,76,0.05)'
                    : 'rgba(255,255,255,0.02)',
                  border: done
                    ? '1px solid rgba(201,168,76,0.3)'
                    : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  transition: 'border-color 0.15s, background 0.15s',
                  width: '100%',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = done ? '#C9A84C' : 'rgba(201,168,76,0.4)';
                  e.currentTarget.style.background = 'rgba(201,168,76,0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = done ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.background = done ? 'rgba(201,168,76,0.05)' : 'rgba(255,255,255,0.02)';
                }}
              >
                {/* Step number / checkmark */}
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: done ? '1px solid #C9A84C' : '1px solid #3a3a5a',
                  background: done ? 'rgba(201,168,76,0.15)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: "'Cinzel', serif",
                  fontSize: done ? '14px' : '11px',
                  color: done ? '#C9A84C' : '#4a4a6a',
                  fontWeight: 600,
                }}>
                  {done ? '✓' : idx + 1}
                </div>

                {/* Title and description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: '13px',
                    fontWeight: 600,
                    color: done ? '#C9A84C' : '#e2e8f0',
                    letterSpacing: '0.05em',
                    marginBottom: '4px',
                  }}>
                    {scenario.title}
                  </div>
                  <div style={{
                    fontFamily: "'Crimson Text', serif",
                    fontSize: '14px',
                    color: '#6a6a8a',
                    lineHeight: 1.4,
                  }}>
                    {scenario.description}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ color: '#3a3a5a', fontSize: '18px', flexShrink: 0 }}>
                  →
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
