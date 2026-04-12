import { useState } from 'react';
import { supabase } from '../supabase.js';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
};

const modalStyle = {
  background: '#0d0d1a',
  border: '1px solid #2a2a3a',
  borderRadius: '6px',
  padding: '32px 28px',
  width: '100%',
  maxWidth: '360px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const inputStyle = {
  width: '100%',
  background: '#0a0a0f',
  border: '1px solid #2a2a3a',
  borderRadius: '4px',
  padding: '10px 12px',
  fontSize: '14px',
  color: '#e2e8f0',
  fontFamily: "'Crimson Text', serif",
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontFamily: "'Cinzel', serif",
  fontSize: '10px',
  letterSpacing: '0.08em',
  color: '#6a6a8a',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: '6px',
};

const errorStyle = {
  fontFamily: "'Crimson Text', serif",
  color: '#bf4a4a',
  fontSize: '13px',
};

function Field({ label, type, value, onChange, placeholder, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'current-password' : 'email'}
        style={{ ...inputStyle, ...(focused ? { borderColor: '#C9A84C60' } : {}) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && <p style={{ ...errorStyle, marginTop: '4px' }}>{error}</p>}
    </div>
  );
}

const AUTH_REDIRECT_URL = 'https://gridholm.com/auth/callback';

export default function SignInModal({ onClose, onSwitchToSignUp }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('signin'); // 'signin' | 'forgot' | 'forgot_sent'
  const [resetEmail, setResetEmail] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (authError) {
      setError('Invalid email or password.');
      return;
    }

    onClose();
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError(null);
    if (!resetEmail.trim()) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: AUTH_REDIRECT_URL,
    });
    setLoading(false);
    if (resetError) {
      setError('Failed to send reset email. Please try again.');
      return;
    }
    setView('forgot_sent');
  }

  if (view === 'forgot') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: '#C9A84C', letterSpacing: '0.1em', margin: 0 }}>
            Reset Password
          </h2>
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} noValidate>
            <Field
              label="Email"
              type="email"
              value={resetEmail}
              onChange={setResetEmail}
              placeholder="you@example.com"
              error={null}
            />
            {error && <p style={errorStyle}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#1a1a2a' : 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                color: loading ? '#4a4a6a' : '#0a0a0f',
                fontFamily: "'Cinzel', serif",
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                padding: '11px',
                cursor: loading ? 'default' : 'pointer',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {loading ? 'Sending…' : 'Send Reset Email'}
            </button>
          </form>
          <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#6a6a8a', textAlign: 'center', margin: 0 }}>
            <button
              onClick={() => { setView('signin'); setError(null); }}
              style={{ background: 'none', border: 'none', color: '#C9A84C', cursor: 'pointer', fontFamily: "'Crimson Text', serif", fontSize: '13px', padding: 0 }}
            >
              Back to Sign In
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (view === 'forgot_sent') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: '#C9A84C', letterSpacing: '0.1em', margin: 0 }}>
            Check Your Email
          </h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#e2e8f0', lineHeight: 1.6, margin: 0 }}>
            A password reset link has been sent to <strong>{resetEmail}</strong>. Follow the link to set a new password.
          </p>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#C9A84C',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              border: '1px solid #C9A84C60',
              borderRadius: '4px',
              padding: '10px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: '#C9A84C', letterSpacing: '0.1em', margin: 0 }}>
          Sign In
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} noValidate>
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            error={null}
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Your password"
            error={null}
          />

          {error && <p style={errorStyle}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#1a1a2a' : 'linear-gradient(135deg, #8a6a00, #C9A84C)',
              color: loading ? '#4a4a6a' : '#0a0a0f',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              padding: '11px',
              cursor: loading ? 'default' : 'pointer',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => { setView('forgot'); setResetEmail(email); setError(null); }}
            style={{ background: 'none', border: 'none', color: '#6a6a8a', cursor: 'pointer', fontFamily: "'Crimson Text', serif", fontSize: '13px', padding: 0 }}
          >
            Forgot password?
          </button>
          <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#6a6a8a', margin: 0 }}>
            No account?{' '}
            <button
              onClick={onSwitchToSignUp}
              style={{ background: 'none', border: 'none', color: '#C9A84C', cursor: 'pointer', fontFamily: "'Crimson Text', serif", fontSize: '13px', padding: 0 }}
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
