import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCreditTransactions, type CreditTransaction } from '../../lib/supabase/credits';

interface CreditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = 'all' | 'earned' | 'spent';

export function CreditHistoryModal({ isOpen, onClose }: CreditHistoryModalProps) {
  const { account, accountLoading, refreshAccount } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState<boolean>(true);
  const [errorTx, setErrorTx] = useState<string | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const fetchLedger = async () => {
    setLoadingTx(true);
    setErrorTx(null);
    refreshAccount();
    try {
      const txs = await getCreditTransactions(50, 0);
      setTransactions(txs);
    } catch (err) {
      console.error('Failed to load credit history:', err);
      setErrorTx('Something went wrong loading your credit history.');
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingTx(true);
    setErrorTx(null);

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
        if (isMounted) {
          setErrorTx('Something went wrong loading your credit history.');
          setLoadingTx(false);
        }
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

  const filteredTransactions = useMemo(() => {
    if (activeFilter === 'earned') {
      return transactions.filter((tx) => tx.amount > 0);
    }
    if (activeFilter === 'spent') {
      return transactions.filter((tx) => tx.amount < 0);
    }
    return transactions;
  }, [transactions, activeFilter]);

  if (!isOpen) return null;

  const getTxTypeTitle = (type: string, amount: number) => {
    switch (type) {
      case 'initial_grant':
        return 'Initial Grant';
      case 'swap_offer':
      case 'swap_hold':
        return 'Credit Reservation';
      case 'swap_completion':
      case 'swap_reward':
        return 'Swap Completion';
      case 'cancellation_refund':
      case 'refund':
        return 'Reservation Release';
      case 'transfer_sent':
        return 'Transfer Sent';
      case 'transfer_received':
        return 'Transfer Received';
      default:
        return amount >= 0 ? 'Credit Grant' : 'Credit Spend';
    }
  };

  const getTxTypeIcon = (type: string, amount: number) => {
    if (type === 'initial_grant') return '✨';
    if (type === 'swap_offer' || type === 'swap_hold') return '🔒';
    if (type === 'cancellation_refund' || type === 'refund') return '↩️';
    if (amount > 0) return '⚡';
    return '📤';
  };

  const getTxBadgeClass = (amount: number, type: string) => {
    if (type === 'initial_grant') return 'credit-badge--grant';
    if (amount > 0) return 'credit-badge--positive';
    return 'credit-badge--negative';
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-modal-title"
    >
      <div className="modal-content credit-history-modal" onClick={(e) => e.stopPropagation()}>
        {/* A. HEADER */}
        <div className="credit-modal-header">
          <div className="credit-modal-header-left">
            <div className="credit-modal-title-group">
              <h2 id="credit-modal-title" className="credit-modal-title">
                Credit Account
                <span className="credit-modal-title-break"> &amp; History</span>
              </h2>
              <p className="credit-modal-subtitle">Your SkillSwap credit activity</p>
            </div>
          </div>
          <button
            type="button"
            className="credit-modal-close-btn"
            onClick={onClose}
            aria-label="Close credit history modal"
          >
            &times;
          </button>
        </div>

        {/* MODAL SCROLLABLE BODY */}
        <div className="credit-modal-body">
          {/* B. PRIMARY BALANCE */}
          <div className="credit-primary-balance-card">
            <span className="credit-balance-eyebrow">Available Balance</span>
            <div className="credit-balance-main-val">
              <span className="credit-balance-number">
                {accountLoading ? '—' : account ? account.credits_balance : '0'}
              </span>
              <span className="credit-balance-currency">SkillCredits</span>
            </div>
            <span className="credit-balance-subtext">Available to use for skill swaps</span>
          </div>

          {/* C. ACCOUNT SUMMARY */}
          <div className="credit-summary-grid">
            <div className="credit-stat-card credit-stat-card--available">
              <span className="credit-stat-label">Available</span>
              <span className="credit-stat-value">
                {accountLoading ? '—' : account ? account.credits_balance : 0}
              </span>
            </div>

            <div className="credit-stat-card credit-stat-card--reserved">
              <span className="credit-stat-label">Reserved</span>
              <span className="credit-stat-value credit-stat-value--reserved">
                {accountLoading ? '—' : account ? account.credits_reserved : 0}
              </span>
            </div>

            <div className="credit-stat-card credit-stat-card--earned">
              <span className="credit-stat-label">Lifetime Earned</span>
              <span className="credit-stat-value credit-stat-value--positive">
                {accountLoading ? '—' : account ? `+${account.credits_earned}` : '+0'}
              </span>
            </div>

            <div className="credit-stat-card credit-stat-card--spent">
              <span className="credit-stat-label">Lifetime Spent</span>
              <span className="credit-stat-value credit-stat-value--negative">
                {accountLoading ? '—' : account ? `-${account.credits_spent}` : '-0'}
              </span>
            </div>
          </div>

          {/* D & F. TRANSACTION LEDGER & FILTER CONTROLS */}
          <div className="credit-ledger-section">
            <div className="credit-ledger-header">
              <h3 className="credit-ledger-title">Transaction History</h3>

              {/* F. FILTERING CONTROLS */}
              {!loadingTx && !errorTx && transactions.length > 0 && (
                <div className="credit-filter-pills" role="tablist" aria-label="Transaction history filters">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeFilter === 'all'}
                    className={`credit-filter-btn ${activeFilter === 'all' ? 'credit-filter-btn--active' : ''}`}
                    onClick={() => setActiveFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeFilter === 'earned'}
                    className={`credit-filter-btn ${activeFilter === 'earned' ? 'credit-filter-btn--active' : ''}`}
                    onClick={() => setActiveFilter('earned')}
                  >
                    Earned
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeFilter === 'spent'}
                    className={`credit-filter-btn ${activeFilter === 'spent' ? 'credit-filter-btn--active' : ''}`}
                    onClick={() => setActiveFilter('spent')}
                  >
                    Spent
                  </button>
                </div>
              )}
            </div>

            {/* H. LOADING STATE */}
            {loadingTx ? (
              <div className="credit-skeleton-list" aria-busy="true" aria-label="Loading credit history">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="credit-skeleton-item">
                    <div className="credit-skeleton-icon" />
                    <div className="credit-skeleton-lines">
                      <div className="credit-skeleton-line credit-skeleton-line--title" />
                      <div className="credit-skeleton-line credit-skeleton-line--desc" />
                    </div>
                    <div className="credit-skeleton-right">
                      <div className="credit-skeleton-line credit-skeleton-line--amount" />
                      <div className="credit-skeleton-line credit-skeleton-line--date" />
                    </div>
                  </div>
                ))}
              </div>
            ) : errorTx ? (
              /* I. ERROR STATE */
              <div className="credit-error-state">
                <div className="credit-error-icon" aria-hidden="true">⚠️</div>
                <p className="credit-error-text">{errorTx}</p>
                <button type="button" className="credit-retry-btn" onClick={fetchLedger}>
                  Try Again
                </button>
              </div>
            ) : filteredTransactions.length === 0 ? (
              /* G. EMPTY STATE */
              <div className="credit-empty-state">
                <div className="credit-empty-icon" aria-hidden="true">⚡</div>
                <h4 className="credit-empty-title">No credit activity yet.</h4>
                <p className="credit-empty-desc">
                  {activeFilter === 'all'
                    ? 'Your SkillCredits activity will appear here when you earn or spend credits.'
                    : activeFilter === 'earned'
                    ? 'No earned credit transactions found.'
                    : 'No spent credit transactions found.'}
                </p>
              </div>
            ) : (
              /* D & E. TRANSACTION LIST & INTERACTION */
              <div className="credit-tx-list">
                {filteredTransactions.map((tx) => {
                  const isExpanded = expandedTxId === tx.id;
                  const title = getTxTypeTitle(tx.transaction_type, tx.amount);
                  const icon = getTxTypeIcon(tx.transaction_type, tx.amount);
                  const badgeClass = getTxBadgeClass(tx.amount, tx.transaction_type);

                  const createdDate = new Date(tx.created_at);
                  const formattedDate = createdDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const formattedTime = createdDate.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={tx.id}
                      className={`credit-tx-card ${isExpanded ? 'credit-tx-card--expanded' : ''}`}
                      onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedTxId(isExpanded ? null : tx.id);
                        }
                      }}
                    >
                      <div className="credit-tx-main-row">
                        <div className="credit-tx-type-icon" aria-hidden="true">
                          {icon}
                        </div>

                        <div className="credit-tx-info">
                          <div className="credit-tx-title-row">
                            <span className="credit-tx-title">{title}</span>
                            <span className={`credit-tx-badge ${badgeClass}`}>
                              {tx.amount > 0 ? 'Credit Added' : 'Credit Spent'}
                            </span>
                          </div>
                          <p className="credit-tx-reason">{tx.reason}</p>
                          <span className="credit-tx-timestamp">
                            {formattedDate} &middot; {formattedTime}
                          </span>
                        </div>

                        <div className="credit-tx-amount-col">
                          <span
                            className={`credit-tx-amount ${
                              tx.amount > 0 ? 'credit-amount--positive' : 'credit-amount--negative'
                            }`}
                          >
                            {tx.amount > 0 ? `+${tx.amount}` : `${tx.amount}`}
                            <span className="credit-tx-currency-unit"> SkillCredits</span>
                          </span>
                          <span className="credit-tx-balance-after">
                            Balance: <strong>{tx.balance_after}</strong>
                          </span>
                          <span className="credit-tx-expand-hint" aria-hidden="true">
                            {isExpanded ? '▲ Details' : '▼ Details'}
                          </span>
                        </div>
                      </div>

                      {/* E. SUBTLE EXPANDED DETAILS */}
                      {isExpanded && (
                        <div
                          className="credit-tx-details-panel"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="credit-tx-detail-grid">
                            <div className="credit-tx-detail-item">
                              <span className="credit-tx-detail-label">Reason:</span>
                              <span className="credit-tx-detail-val">{tx.reason}</span>
                            </div>
                            <div className="credit-tx-detail-item">
                              <span className="credit-tx-detail-label">Amount:</span>
                              <span className="credit-tx-detail-val">
                                {tx.amount > 0 ? `+${tx.amount}` : `${tx.amount}`} SkillCredits
                              </span>
                            </div>
                            <div className="credit-tx-detail-item">
                              <span className="credit-tx-detail-label">Balance after:</span>
                              <span className="credit-tx-detail-val">{tx.balance_after}</span>
                            </div>
                            <div className="credit-tx-detail-item">
                              <span className="credit-tx-detail-label">Date:</span>
                              <span className="credit-tx-detail-val">{formattedDate}</span>
                            </div>
                            <div className="credit-tx-detail-item">
                              <span className="credit-tx-detail-label">Time:</span>
                              <span className="credit-tx-detail-val">{formattedTime}</span>
                            </div>
                            <div className="credit-tx-detail-item">
                              <span className="credit-tx-detail-label">Type:</span>
                              <span className="credit-tx-detail-val">{title}</span>
                            </div>
                            <div className="credit-tx-detail-item credit-tx-detail-item--full">
                              <span className="credit-tx-detail-label">Transaction ID:</span>
                              <code className="credit-tx-detail-code">{tx.id}</code>
                            </div>
                            {tx.related_swap_id && (
                              <div className="credit-tx-detail-item credit-tx-detail-item--full">
                                <span className="credit-tx-detail-label">Related Swap ID:</span>
                                <code className="credit-tx-detail-code">{tx.related_swap_id}</code>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="credit-modal-footer">
          <button type="button" className="credit-close-action-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
