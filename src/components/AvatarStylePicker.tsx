import { useId } from 'react'
import { AVATAR_STYLES, PROFILE_COLOR_HEX } from '../lib/profile'
import type { AvatarStyle } from '../lib/profile'
import './AvatarChoice.css'

// Small SVG portraits keep the entry screen light; no second WebGL canvas.
export function AvatarPortrait({ style, color = '#277c77' }: { style: AvatarStyle; color?: string }) {
  return <svg viewBox="0 0 220 210" aria-hidden="true" className="avatar-portrait">
    <ellipse cx="110" cy="197" rx="57" ry="7" fill="#173e33" opacity=".12" />
    <circle cx="110" cy="95" r="72" fill="currentColor" opacity=".07" />
    {style === 'girl' && <path d="M145 62c27 4 29 29 18 56l-15-12c12-23 3-31-9-32" fill="#302a28" />}
    <rect x="59" y="128" width="103" height="68" rx="25" fill="#be8850" />
    <path d="M75 132q35-17 70 0l11 57H64z" fill={color} />
    <path d="M78 135l-11 36M142 135l11 36" stroke="#203e39" strokeWidth="8" strokeLinecap="round" />
    <path d="M110 137v50" stroke="#f7f4e8" strokeWidth="2" />
    <path d="M86 155v12m0-12 9 12v-12" fill="none" stroke="#f7f4e8" strokeWidth="3" strokeLinejoin="round" />
    <path d="M76 185h68" stroke="#203e39" strokeWidth="7" />
    <path d="M97 153v20M123 153v20" stroke="#f7f4e8" strokeWidth="2" strokeLinecap="round" />
    <rect x="97" y="110" width="26" height="27" rx="9" fill="#bd805b" />
    <ellipse cx="110" cy="85" rx="39" ry="46" fill="#cf9871" />
    <ellipse cx="70" cy="89" rx="7" ry="11" fill="#cf9871" /><ellipse cx="150" cy="89" rx="7" ry="11" fill="#cf9871" />
    {style === 'girl' ? <path d="M72 93c-11-34 1-64 37-65 35-1 46 24 41 62l-9-28c-12-1-20-10-23-17-10 17-25 22-39 22z" fill="#302a28" /> : <path d="M72 87c-10-25-2-52 24-58l-2-9c20 1 44 4 52 22 9 17 7 28 3 43l-7-23c-20 3-37 1-55-4l-8 31z" fill="#302a28" />}
    <path d="M85 80l12-2M123 78l12 2" stroke="#302a28" strokeWidth="3" strokeLinecap="round" />
    {[91,129].map(x => <g key={x}><ellipse cx={x} cy="89" rx="7" ry="8" fill="#fff9ec" /><ellipse cx={x} cy="90" rx="3.5" ry="5" fill="#302a28" /><circle cx={x+1} cy="87" r="1.4" fill="#fff" /></g>)}
    <path d="M109 93l-3 9h6" fill="none" stroke="#b97d57" strokeWidth="2" strokeLinecap="round" />
    <path d="M99 111q11 8 22 0" fill="none" stroke="#775043" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
}
export default function AvatarStylePicker({ value, onChange, color = 'forest', disabled = false }: { value?: AvatarStyle | null; onChange: (style: AvatarStyle) => void; color?: keyof typeof PROFILE_COLOR_HEX; disabled?: boolean }) {
  const id = useId()
  return <fieldset className="avatar-style-picker" disabled={disabled}>
    <legend>Choose your avatar</legend>
    <div className="avatar-style-options">
      {AVATAR_STYLES.map(style => <label key={style} className={`avatar-style-option ${value === style ? 'selected' : ''}`}>
        <input type="radio" name={`${id}-avatar-style`} value={style} checked={value === style} onChange={() => onChange(style)} />
        <span className="avatar-style-check" aria-hidden="true">{value === style ? '✓' : ''}</span>
        <AvatarPortrait style={style} color={PROFILE_COLOR_HEX[color]} />
        <span className="avatar-style-label">{style === 'girl' ? 'Girl' : 'Boy'}</span>
      </label>)}
    </div>
  </fieldset>
}
