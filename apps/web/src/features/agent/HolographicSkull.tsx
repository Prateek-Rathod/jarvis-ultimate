export function HolographicSkull() {
  return (
    <svg
      className="holographic-skull"
      viewBox="0 0 520 460"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="skull-steel" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f1f2f2" />
          <stop offset=".18" stopColor="#53585d" />
          <stop offset=".38" stopColor="#c2c6c8" />
          <stop offset=".56" stopColor="#303438" />
          <stop offset=".76" stopColor="#aeb3b6" />
          <stop offset="1" stopColor="#3c4145" />
        </linearGradient>
        <linearGradient id="skull-dark-steel" x1="0" x2=".85" y1="0" y2="1">
          <stop offset="0" stopColor="#777d82" />
          <stop offset=".25" stopColor="#222629" />
          <stop offset=".66" stopColor="#575d62" />
          <stop offset="1" stopColor="#171a1d" />
        </linearGradient>
        <linearGradient id="skull-highlight" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".8" />
          <stop offset=".42" stopColor="#bec3c6" stopOpacity=".35" />
          <stop offset="1" stopColor="#101214" stopOpacity=".78" />
        </linearGradient>
        <linearGradient id="skull-reactor" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffcb8a" />
          <stop offset=".48" stopColor="#ff5936" />
          <stop offset="1" stopColor="#a80c16" />
        </linearGradient>
        <radialGradient id="skull-eye-core">
          <stop offset="0" stopColor="#fff4dc" />
          <stop offset=".22" stopColor="#ffad67" />
          <stop offset=".55" stopColor="#ff3030" />
          <stop offset="1" stopColor="#790a14" />
        </radialGradient>
        <radialGradient id="skull-reactor-core">
          <stop offset="0" stopColor="#fff4cf" />
          <stop offset=".24" stopColor="#ff9f50" />
          <stop offset=".62" stopColor="#ff3030" />
          <stop offset="1" stopColor="#680912" />
        </radialGradient>
        <filter id="skull-red-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="skull-orange-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="skull-drop-shadow" x="-35%" y="-25%" width="170%" height="175%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="shadow" />
          <feOffset dy="7" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".55" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="skull-reactor-field" fill="none" stroke="currentColor">
        <circle className="skull-reactor-orbit" cx="260" cy="228" r="202" />
        <circle
          className="skull-reactor-orbit skull-reactor-orbit-inner"
          cx="260"
          cy="228"
          r="184"
        />
        <circle className="skull-reactor-track" cx="260" cy="228" r="167" />
        <circle
          className="skull-reactor-track skull-reactor-track-inner"
          cx="260"
          cy="228"
          r="152"
        />
        <path
          className="skull-wave skull-wave-a"
          d="M-18 169C68 137 118 186 184 179s109-47 175-24 105 51 180 17"
        />
        <path
          className="skull-wave skull-wave-b"
          d="M-24 203c85-29 132 30 205 18s97-52 166-20 103 36 187 2"
        />
        <path
          className="skull-wave skull-wave-c"
          d="M-15 261c75-23 124-8 192 10s116 9 170-14 99-25 188 7"
        />
        <path
          className="skull-wave skull-wave-d"
          d="M-21 299c72-36 126-27 188-1s119 29 177 0 107-32 188-1"
        />
        <path className="skull-scan" d="M75 228h370M105 332h310" />
        <g className="skull-reactor-ticks">
          {Array.from({ length: 72 }, (_, index) => (
            <path key={index} d="M260 17v8" transform={`rotate(${index * 5} 260 228)`} />
          ))}
        </g>
        <path className="skull-reactor-segment" d="M260 44a184 184 0 0 1 130 54" />
        <path
          className="skull-reactor-segment skull-reactor-segment-alt"
          d="M130 358a184 184 0 0 1-54-130"
        />
      </g>

      <g className="skull-art" filter="url(#skull-drop-shadow)">
        <path
          className="skull-silhouette"
          d="M260 45c-73 0-128 31-145 91-11 39-6 92 5 130 7 26 21 49 43 65l14 46c5 18 19 30 39 33 29 5 64 5 91 0 20-3 34-15 39-33l14-46c22-16 36-39 43-65 11-38 16-91 5-130-17-60-72-91-148-91Z"
          fill="url(#skull-dark-steel)"
          stroke="url(#skull-highlight)"
        />
        <path
          className="skull-forehead-plate"
          d="M149 157c8-67 47-99 111-99s103 32 111 99c-36-20-72-28-111-28s-75 8-111 28Z"
          fill="url(#skull-steel)"
        />
        <path className="skull-forehead-ridge" d="M157 144c27-24 62-35 103-35s76 11 103 35" />
        <path className="skull-brow" d="M139 185c35-28 76-38 121-27m121 27c-35-28-76-38-121-27" />

        <path
          className="skull-temple-plate"
          d="m131 172 35 8-9 89-34-20c-8-24-10-51 8-77Zm258 0-35 8 9 89 34-20c8-24 10-51-8-77Z"
          fill="url(#skull-dark-steel)"
        />
        <path className="skull-temple-line" d="m137 196 20 8m226-8-20 8m-225 17 18 5m236-5-18 5" />
        <circle className="skull-bolt" cx="143" cy="244" r="5" />
        <circle className="skull-bolt" cx="377" cy="244" r="5" />
        <path className="skull-bolt-slot" d="m140 244 6 0m228 0h6" />

        <path
          className="skull-eye-socket"
          d="M155 208c20-25 47-34 72-22 12 6 20 17 24 31-8 23-25 40-49 46-20 4-38-5-50-25-4-10-3-20 3-30Zm210 0c-20-25-47-34-72-22-12 6-20 17-24 31 8 23 25 40 49 46 20 4 38-5 50-25 4-10 3-20-3-30Z"
          fill="#090a0b"
          stroke="url(#skull-highlight)"
        />
        <path
          className="skull-eye"
          d="M166 222c18-16 38-20 57-10l15 10c-12 17-26 27-42 30-16 1-26-8-30-30Zm188 0c-18-16-38-20-57-10l-15 10c12 17 26 27 42 30 16 1 26-8 30-30Z"
          fill="url(#skull-eye-core)"
          filter="url(#skull-red-glow)"
        />
        <path className="skull-eye-slit" d="M174 222h57m115 0h-57" />

        <path
          className="skull-cheek-plate"
          d="m157 269 35 8 23 29-23 22-35-18-13-23 13-18Zm206 0-35 8-23 29 23 22 35-18 13-23-13-18Z"
          fill="url(#skull-steel)"
        />
        <path
          className="skull-cheek-inset"
          d="m165 277 23 7 14 20-14 12-24-13m191-26-23 7-14 20 14 12 24-13"
        />
        <path
          className="skull-nose-bridge"
          d="m241 204 19-15 19 15-7 43 13 21-25 18-25-18 13-21-7-43Z"
          fill="url(#skull-dark-steel)"
        />
        <path
          className="skull-nose-highlight"
          d="m251 211 9-8 9 8-5 33 8 20-12 9-12-9 8-20-5-33Z"
        />

        <path
          className="skull-jaw-plate"
          d="M190 321c22 12 45 18 70 18s48-6 70-18l-10 42c-3 13-13 21-27 23-20 3-46 3-66 0-14-2-24-10-27-23l-10-42Z"
          fill="url(#skull-dark-steel)"
        />
        <path
          className="skull-jaw-ridge"
          d="M199 329c18 10 39 15 61 15s43-5 61-15m-114 28c15 8 33 12 53 12s38-4 53-12"
        />
        <path className="skull-teeth-rail" d="M210 337h100" />
        <path className="skull-teeth" d="M219 338v23m20-20v25m21-24v25m21-25v24m20-28v23" />
        <path
          className="skull-chin-plate"
          d="M226 382c11 4 22 5 34 5s23-1 34-5l-9 16h-50l-9-16Z"
          fill="url(#skull-steel)"
        />

        <path
          className="skull-side-rail"
          d="M119 214c-10 16-12 36-4 54l18 15m268-69c10 16 12 36 4 54l-18 15"
        />
        <path
          className="skull-side-highlight"
          d="m126 283 17 15m251-15-17 15m-234 15 13 10m211-10-13 10"
        />
        <path
          className="skull-reactor-mount"
          d="M237 78h46l10 15-33 19-33-19 10-15Z"
          fill="url(#skull-dark-steel)"
        />
        <circle className="skull-reactor-ring" cx="260" cy="96" r="13" />
        <circle
          className="skull-reactor-core"
          cx="260"
          cy="96"
          r="7"
          fill="url(#skull-reactor-core)"
          filter="url(#skull-orange-glow)"
        />
        <path
          className="skull-surface-glint"
          d="M172 127c17-36 46-55 84-58m92 58c-17-36-46-55-84-58M150 168l18 3m202-3-18 3"
        />
      </g>

      <g className="skull-particles" fill="currentColor">
        <circle cx="83" cy="127" r="2" />
        <circle cx="438" cy="124" r="1.7" />
        <circle cx="73" cy="303" r="1.6" />
        <circle cx="447" cy="301" r="2" />
        <circle cx="145" cy="393" r="1.5" />
        <circle cx="375" cy="392" r="1.5" />
        <path d="m104 178 2-7 2 7 7 2-7 2-2 7-2-7-7-2Zm307 104 2-7 2 7 7 2-7 2-2 7-2-7-7-2Z" />
      </g>
    </svg>
  );
}
