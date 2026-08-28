export function Logo() {
  return (
    <a className="brand" href="/" aria-label="Skillswap home">
      <svg className="brand-mark" viewBox="0 0 48 48" role="img" aria-hidden="true">
        <path d="M24 7c6 0 10 4 10 9 0 4-3 7-7 8l-6 2c-4 1-7 4-7 8s4 7 9 7c6 0 10-4 10-9" />
        <path d="M24 7c-6 0-10 4-10 9 0 4 3 7 7 8l6 2c4 1 7 4 7 8s-4 7-9 7c-6 0-10-4-10-9" />
        <path d="M31 12l3 4-4 3M17 36l-3-4 4-3" />
      </svg>
      <span className="wordmark">Skillswap</span>
    </a>
  );
}
