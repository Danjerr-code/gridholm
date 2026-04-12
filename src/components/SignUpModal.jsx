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

const inputFocusStyle = {
  borderColor: '#C9A84C60',
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
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        style={{ ...inputStyle, ...(focused ? inputFocusStyle : {}) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && <p style={{ ...errorStyle, marginTop: '4px' }}>{error}</p>}
    </div>
  );
}

export default function SignUpModal({ onClose, onSwitchToSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function validate() {
    const errs = {};
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Enter a valid email.';
    if (!password) errs.password = 'Password is required.';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters.';
    if (!username.trim()) errs.username = 'Username is required.';
    else if (username.trim().length < 2) errs.username = 'Username must be at least 2 characters.';
    else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) errs.username = 'Username may only contain letters, numbers, and underscores.';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });

    if (error) {
      setLoading(false);
      setServerError(error.message);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        username: username.trim(),
      });
      if (profileError) {
        setLoading(false);
        if (profileError.code === '23505') {
          setFieldErrors({ username: 'Username is already taken.' });
        } else {
          setServerError(profileError.message);
        }
        return;
      }
    }

    setLoading(false);
    setSuccess(true);
  }

  if (success) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: '#C9A84C', letterSpacing: '0.1em', margin: 0 }}>
            Check Your Email
          </h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '15px', color: '#a0a0c0', lineHeight: 1.6 }}>
            A confirmation link was sent to <strong style={{ color: '#e2e8f0' }}>{email}</strong>. Click it to activate your account, then sign in.
          </p>
          <button
            onClick={onClose}
            style={{
              background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
              color: '#0a0a0f',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              padding: '10px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: '#C9A84C', letterSpacing: '0.1em', margin: 0 }}>
          Create Account
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} noValidate>
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            error={fieldErrors.email}
          />
          <Field
            label="Username"
            type="text"
            value={username}
            onChange={setUsername}
            placeholder="warrior42"
            error={fieldErrors.username}
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="6+ characters"
            error={fieldErrors.password}
          />

          {serverError && <p style={errorStyle}>{serverError}</p>}

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
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        </form>

        <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#6a6a8a', textAlign: 'center', margin: 0 }}>
          Already have an account?{' '}
          <button
            onClick={onSwitchToSignIn}
            style={{ background: 'none', border: 'none', color: '#C9A84C', cursor: 'pointer', fontFamily: "'Crimson Text', serif", fontSize: '13px', padding: 0 }}
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
