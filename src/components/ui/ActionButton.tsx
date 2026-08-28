type ActionButtonProps = {
  href: string;
  children: string;
  variant: 'filled' | 'outline';
};

export function ActionButton({ href, children, variant }: ActionButtonProps) {
  return (
    <a className={`action-button action-button--${variant}`} href={href}>
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </a>
  );
}
