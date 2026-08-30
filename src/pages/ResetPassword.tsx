import { ForgotPasswordPage } from './ForgotPassword';

type ResetPasswordPageProps = {
  onNavigate?: (path: string) => void;
};

/**
 * ResetPasswordPage component aliases to the unified ForgotPasswordPage OTP flow.
 * Any link pointing to /reset-password will present the secure 6-digit OTP recovery flow.
 */
export function ResetPasswordPage({ onNavigate }: ResetPasswordPageProps) {
  return <ForgotPasswordPage onNavigate={onNavigate} />;
}
