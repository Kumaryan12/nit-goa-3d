export default function CampusIllustration() {
  const buildings = [
    [168, 114, 85, 47],
    [278, 128, 74, 39],
    [349, 190, 105, 54],
    [207, 213, 91, 44],
    [99, 207, 59, 36],
    [328, 291, 56, 33],
  ]
  const trees = [
    [91, 154],
    [137, 165],
    [187, 180],
    [234, 159],
    [314, 217],
    [364, 257],
    [290, 298],
    [168, 286],
    [113, 280],
    [378, 116],
    [425, 155],
    [463, 255],
    [229, 328],
    [78, 235],
    [333, 99],
  ]
  return (
    <svg
      className="campus-illustration"
      viewBox="0 0 600 470"
      role="img"
      aria-label="Illustration of a green campus with red-roof buildings, a football ground and an open-air theatre"
    >
      <defs>
        <linearGradient id="land" x2="0.8" y2="1">
          <stop stopColor="#b3c694" />
          <stop offset="1" stopColor="#7e9f72" />
        </linearGradient>
        <filter id="mapShadow">
          <feDropShadow
            dx="0"
            dy="22"
            stdDeviation="18"
            floodColor="#102f26"
            floodOpacity=".15"
          />
        </filter>
        <pattern
          id="windows"
          width="13"
          height="13"
          patternUnits="userSpaceOnUse"
        >
          <rect x="4" y="3" width="4" height="6" fill="#799592" />
        </pattern>
      </defs>
      <ellipse cx="300" cy="414" rx="207" ry="17" fill="#254d3520" />
      <g filter="url(#mapShadow)">
        <path d="M55 287 237 43 545 167 394 409Z" fill="#607d56" />
        <path d="M55 274 237 30 545 154 394 396Z" fill="url(#land)" />
        <path
          d="m90 266 120-139q18-22 49-9l229 92M155 316l56-73q19-28 55-13l124 51q29 13 44-12l56-76"
          fill="none"
          stroke="#637461"
          strokeWidth="13"
          strokeLinejoin="round"
        />
        <path
          d="m92 266 120-139q18-22 49-9l229 92M155 316l56-73q19-28 55-13l124 51q29 13 44-12l56-76"
          fill="none"
          stroke="#d7d9bd"
          strokeWidth="1"
          strokeDasharray="7 7"
        />
        <g transform="translate(337 333) rotate(-53)">
          <rect width="100" height="64" rx="4" fill="#639365" />
          <rect
            x="7"
            y="7"
            width="86"
            height="50"
            fill="none"
            stroke="#eef4d9"
          />
          <path
            d="M50 7v50M7 20h17v24H7m86-24H76v24h17"
            fill="none"
            stroke="#eef4d9"
          />
          <circle cx="50" cy="32" r="10" fill="none" stroke="#eef4d9" />
        </g>
        <g transform="translate(263 276) rotate(23)">
          <path
            d="M-38 0a38 38 0 0 0 76 0"
            fill="none"
            stroke="#a39778"
            strokeWidth="6"
          />
          <path
            d="M-28 0a28 28 0 0 0 56 0"
            fill="none"
            stroke="#b5aa8a"
            strokeWidth="6"
          />
          <path
            d="M-18 0a18 18 0 0 0 36 0"
            fill="none"
            stroke="#c7bda0"
            strokeWidth="6"
          />
          <rect x="-15" y="-8" width="30" height="12" rx="2" fill="#a96440" />
        </g>
        {buildings.map(([x, y, w, h], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d={`M0 0 ${w} 34 ${w} ${h + 34} 0 ${h}Z`} fill="#c9c7ad" />
            <path
              d={`M${w} 34 ${w + 22} 11 ${w + 22} ${h + 11} ${w} ${h + 34}Z`}
              fill="#aebba9"
            />
            <path
              d={`M6 7 ${w - 6} 36 ${w - 6} ${h + 28} 6 ${h - 4}Z`}
              fill="url(#windows)"
              opacity=".7"
            />
            <path
              d={`M-4 -2 19 -25 ${w + 27} 10 ${w + 3} 37Z`}
              fill="#b76543"
            />
            <path
              d={`M19 -25 ${w + 27} 10 ${w + 13} 14 10 -19Z`}
              fill="#cd8153"
            />
          </g>
        ))}
        {trees.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <ellipse cx="9" cy="17" rx="13" ry="4" fill="#354b3425" />
            <path d="M0 0v17" stroke="#806e49" strokeWidth="3" />
            {i % 3 === 0 ? (
              <g fill="#537945">
                <path d="M0-2-18-10-7-11 0-17 2-6 16-7 7 0 19 6 4 4 0 15-3 4-18 9-8 0Z" />
              </g>
            ) : (
              <path
                d="M-11-12-3-20 8-18 13-7 5 2-7 0Z"
                fill={i % 2 ? '#477248' : '#62894a'}
              />
            )}
          </g>
        ))}
        <path d="m126 337 12-17 30 12-11 15Z" fill="#eadcc0" />
        <path d="M138 320v-13m30 25v-13" stroke="#697b63" strokeWidth="3" />
      </g>
      <g className="map-pin" transform="translate(457 108)">
        <circle r="25" fill="#f8f5e8" />
        <path
          d="M-7-7h14v13H-7Zm-3 13h20M-10-7l10-7 10 7"
          fill="none"
          stroke="#39694e"
          strokeWidth="1.8"
        />
      </g>
    </svg>
  )
}
