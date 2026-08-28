type ActionButtonProps = {
  href: string;
  children: string;
  variant: 'filled' | 'outline';
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

export function ActionButton({ href, children, variant, onClick }: ActionButtonProps) {
  return (
    <a className={`action-button action-button--${variant}`} href={href} onClick={onClick}>
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </a>
  );
}
