import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCreditTransactions, type CreditTransaction } from '../../lib/supabase/credits';

interface CreditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreditHistoryModal({ isOpen, onClose }: CreditHistoryModalProps) {
  const { account, accountLoading, refreshAccount } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingTx(true);

    refreshAccount();
    getCreditTransactions(50, 0)
      .then((txs) => {
        if (isMounted) {
          setTransactions(txs);
          setLoadingTx(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load credit history:', err);
        if (isMounted) setLoadingTx(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, refreshAccount]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getTxTypeLabel = (type: string) => {
    switch (type) {
      case 'initial_grant':
        return 'Initial Grant';
      case 'swap_offer':
      case 'swap_hold':
        return 'Swap Reserved';
      case 'swap_completion':
      case 'swap_reward':
        return 'Swap Earned';
      case 'cancellation_refund':
      case 'refund':
        return 'Refund';
      case 'transfer_sent':
        return 'Transfer Sent';
      case 'transfer_received':
        return 'Transfer Received';
      default:
        return type.replace('_', ' ');
    }
  };

  const getTxBadgeClass = (amount: number, type: string) => {
    if (type === 'initial_grant') return 'credit-badge--grant';
    if (amount > 0) return 'credit-badge--positive';
    return 'credit-badge--negative';
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Credit History">
      <div className="modal-content credit-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-header" style={{ borderBottom: '1px solid var(--shell-border, rgba(17,22,28,0.12))', paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFB800 0%, #FF8A00 100%)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: '1rem',
                boxShadow: '0 2px 8px rgba(255,138,0,0.3)',
              }}
            >
              ⚡
            </div>
            <div>
              <h3 className="chat-title" style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                Credit Account & History
              </h3>
              <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                Authoritative transaction ledger for your SkillSwap credits
              </p>
            </div>
          </div>
          <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {/* ACCOUNT BALANCE CARDS */}
        <div className="credit-summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="credit-stat-card credit-stat-card--primary">
            <span className="credit-stat-label">Available Balance</span>
            <span className="credit-stat-value">
              {accountLoading ? '...' : account ? account.credits_balance : 'Unavailable'}{' '}
              <span className="credit-unit">Credits</span>
            </span>
          </div>

          <div className="credit-stat-card">
            <span className="credit-stat-label">Reserved</span>
            <span className="credit-stat-value" style={{ color: '#E65100' }}>
              {accountLoading ? '...' : account ? account.credits_reserved : 'Unavailable'}
            </span>
          </div>

          <div className="credit-stat-card">
            <span className="credit-stat-label">Lifetime Earned</span>
            <span className="credit-stat-value credit-stat-value--green">
              {accountLoading ? '...' : account ? `+${account.credits_earned}` : 'Unavailable'}
            </span>
          </div>

          <div className="credit-stat-card">
            <span className="credit-stat-label">Lifetime Spent</span>
            <span className="credit-stat-value credit-stat-value--muted">
              {accountLoading ? '...' : account ? `-${account.credits_spent}` : 'Unavailable'}
            </span>
          </div>
        </div>

        {/* TRANSACTION HISTORY LEDGER */}
        <div className="credit-ledger-section">
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-color)' }}>
            Transaction Ledger
          </h4>

          {loadingTx ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner-dots" style={{ width: '20px', height: '20px', margin: '0 auto 0.5rem' }} />
              Loading credit history...
            </div>
          ) : transactions.length === 0 ? (
            <div className="sr-empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
              <p>No credit transactions recorded yet.</p>
            </div>
          ) : (
            <div className="credit-tx-list">
              {transactions.map((tx) => (
                <div key={tx.id} className="credit-tx-item">
                  <div className="credit-tx-left">
                    <span className={`credit-tx-badge ${getTxBadgeClass(tx.amount, tx.transaction_type)}`}>
                      {getTxTypeLabel(tx.transaction_type)}
                    </span>
                    <span className="credit-tx-reason">{tx.reason}</span>
                  </div>

                  <div className="credit-tx-right">
                    <span className={`credit-tx-amount ${tx.amount > 0 ? 'credit-amount--positive' : 'credit-amount--negative'}`}>
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                    </span>
                    <span className="credit-tx-balance-after">
                      Balance: {tx.balance_after}
                    </span>
                    <span className="credit-tx-date">
                      {new Date(tx.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--shell-border, rgba(17,22,28,0.12))' }}>
          <button type="button" className="modal-btn modal-btn--confirm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
