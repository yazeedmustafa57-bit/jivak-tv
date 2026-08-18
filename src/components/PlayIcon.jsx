// Video-Play-Icon als Thumbnail-Overlay (BBC-/Rudaw-Stil):
// Weißes Quadrat mit umrandetem Play-Dreieck, unten links im Thumbnail.
export default function PlayIcon({ size = 48, className = '' }) {
  return (
    <span
      className={`play-icon${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="48" height="48" rx="4" fill="#FFFFFF" />
        <path
          d="M20 15 L36 24 L20 33 Z"
          stroke="#b3392e"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
