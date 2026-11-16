interface AmphionLogoProps {
  size?: "small" | "large";
  animated?: boolean;
}

export default function AmphionLogo({ size = "small", animated = false }: AmphionLogoProps) {
  return (
    <span className={`amphion-logo amphion-logo-${size} ${animated ? "amphion-logo-animated" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M26 53 23 20c-.5-5.5 3.5-10 9-10s9.5 4.5 9 10l-3 33Z" />
        <path d="M28.5 16 31 49M35.5 16 33 49" />
        <path d="M23.5 23h-6M24 31h-7M40.5 23h6M40 31h7" />
        <circle cx="15" cy="23" r="2.5" />
        <circle cx="14.5" cy="31" r="2.5" />
        <circle cx="49" cy="23" r="2.5" />
        <circle cx="49.5" cy="31" r="2.5" />
      </svg>
    </span>
  );
}
