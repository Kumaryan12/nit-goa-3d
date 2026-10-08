import { useId } from 'react'
import { AVATAR_STYLES, PROFILE_COLOR_HEX } from '../lib/profile'
import type { AvatarStyle } from '../lib/profile'
import './AvatarChoice.css'

// Small SVG portraits keep the entry screen light; no second WebGL canvas.
export function AvatarPortrait({ style, color = '#277c77' }: { style: AvatarStyle; color?: string }) {
  return <svg viewBox="0 0 220 210" aria-hidden="true" className="avatar-portrait">
    <ellipse cx="110" cy="197" rx="57" ry="7" fill="#173e33" opacity=".12" />
    <circle cx="110" cy="95" r="72" fill="currentColor" opacity=".07" />
    {style === 'girl' && <g><path d="M144 58c30 1 32 30 16 62l-13-15c10-22 7-31-7-36" fill="#242529" /><path d="M148 70l12 5" stroke="#bf9861" strokeWidth="5" strokeLinecap="round" /></g>}
    <rect x="59" y="128" width="103" height="68" rx="25" fill="#263843" />
    <path d="M75 132q35-17 70 0l11 57H64z" fill={color} />
    <path d="M78 135l-11 36M142 135l11 36" stroke="#203e39" strokeWidth="8" strokeLinecap="round" />
    <path d="M110 137v50" stroke="#f7f4e8" strokeWidth="2" /><rect x="107" y="142" width="6" height="9" rx="2" fill="#f7f4e8" /><path d="M99 133l11 10 11-10" fill="none" stroke="#f7f4e8" strokeWidth="3" />
    <path d="M86 155v12m0-12 9 12v-12" fill="none" stroke="#f7f4e8" strokeWidth="3" strokeLinejoin="round" />
    <path d="M76 185h68" stroke="#203e39" strokeWidth="7" />
    <path d="M97 153v20M123 153v20" stroke="#f7f4e8" strokeWidth="2" strokeLinecap="round" />
    <rect x="97" y="110" width="26" height="27" rx="9" fill="#bd805b" />
    <ellipse cx="110" cy="85" rx="39" ry="46" fill="#cf9871" />
    <ellipse cx="70" cy="89" rx="7" ry="11" fill="#cf9871" /><ellipse cx="150" cy="89" rx="7" ry="11" fill="#cf9871" />
    {style === 'girl' ? <g>
      <path d="M72 95c-10-36 1-65 38-65 36 0 46 29 38 65l-8-31c-15-2-24-14-30-21-6 10-19 20-31 21z" fill="#242529" />
      <path d="M104 40q-12 16-27 20M116 40q12 16 27 20" fill="none" stroke="#443c35" strokeWidth="2.5" strokeLinecap="round" />
    </g> : <g>
      <path d="M72 88c-9-30 4-56 34-59 23-9 47 5 48 26 1 13-2 24-6 34l-7-28c-10-2-20-7-27-14-10 10-22 13-34 14z" fill="#242529" />
      <path d="M83 43q15-15 30-8M92 49q15-14 28-8M102 53q12-9 22-6" fill="none" stroke="#443c35" strokeWidth="2.5" strokeLinecap="round" />
    </g>}
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
