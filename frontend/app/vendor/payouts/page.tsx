"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useRoleContext } from "../../../components/RoleContext";
import { Footer } from "../../../components/TrustFooter";
import VendorDashboardTopBar from "../../../components/VendorDashboardTopBar";
import { getVendorAuthHeaders, vendorApiFetch } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";


export default function VendorPayoutsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <VendorDashboardTopBar unreadCount={0} onOpenBidNotifications={() => {}} />
          <div className="pt-32 pb-20 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B1A33] mx-auto mb-4"></div>
              <p className="text-gray-600" style={{ fontFamily: 'Inter' }}>Loading...</p>
            </div>
          </div>
          <Footer />
        </div>
      }
    >
      <VendorPayoutsContent />
    </Suspense>
  );
}

function VendorPayoutsContent() {
  const { isAuthenticated, user, authChecked } = useRoleContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [stripeConnectEnabled, setStripeConnectEnabled] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const loadingRef = useRef(false);
  const redirectingRef = useRef(false);
  const dataLoadedRef = useRef(false);

  const loadBalance = async (): Promise<number> => {
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/payouts/balance`, {
        credentials: 'include',
        headers: getVendorAuthHeaders(),
        cache: 'no-store', // Prevent caching
      });
      if (response.status === 401) {
        // leave auth cleanup to RoleContext
        return 0;
      }
      if (response.ok) {
        const data = await response.json();
        const balanceValue = Number(data.balance) || 0;
        console.log('Balance loaded:', balanceValue);
        setBalance(balanceValue);
        return balanceValue;
      }
      return 0;
    } catch (error) {
      console.error('Error loading balance:', error);
      return 0;
    }
  };


  const checkStripeConnectStatus = async (currentBalance?: number) => {
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/vendors/stripe-connect/status`, {
        credentials: 'include',
        headers: getVendorAuthHeaders(),
      });
      if (response.status === 401) {
        // leave auth cleanup to RoleContext
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setStripeConnectEnabled(data.enabled || false);
      } else {
        // status API failed — infer Connect from balance/history
        const balanceToCheck = currentBalance !== undefined ? currentBalance : balance;
        if (balanceToCheck > 0) {
          setStripeConnectEnabled(true);
        } else {
          try {
            const balanceResponse = await fetch(`${resolveApiBaseUrl()}/payouts/vendor/balance`, {
              credentials: 'include',
              headers: getVendorAuthHeaders(),
            });
            if (balanceResponse.ok) {
              const balanceData = await balanceResponse.json();
              const hasBalance = balanceData && Number(balanceData.balance) > 0;
              const historyResponse = await fetch(`${resolveApiBaseUrl()}/payouts/vendor/history`, {
                credentials: 'include',
                headers: getVendorAuthHeaders(),
              });
              let hasHistory = false;
              if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                hasHistory = Array.isArray(historyData) && historyData.length > 0;
              }
              setStripeConnectEnabled(hasBalance || hasHistory);
            }
          } catch (balanceError) {
            console.error('Error checking balance for Stripe status fallback:', balanceError);
          }
        }
      }
    } catch (error) {
      console.error('Error checking Stripe Connect status:', error);
    }
  };

  const loadData = useCallback(async () => {
    if (!authChecked || !isAuthenticated || user?.role !== 'VENDOR') {
      return;
    }
    // guard against overlapping loads
    if (loadingRef.current || dataLoadedRef.current) {
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    try {
      // balance first so Stripe status can use it as a fallback
      const balanceValue = await loadBalance();
      await checkStripeConnectStatus(balanceValue);
      dataLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [authChecked, isAuthenticated, user?.role]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    // avoid redirect loops
    if (redirectingRef.current || pathname?.includes('/vendor/auth/login')) {
      return;
    }

    if (!isAuthenticated || user?.role !== 'VENDOR') {
      if (!redirectingRef.current) {
        redirectingRef.current = true;
        router.replace('/vendor/auth/login');
      }
      return;
    }

    if (isAuthenticated && user?.role === 'VENDOR' && !dataLoadedRef.current && !loadingRef.current) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.role, router, authChecked, pathname]);

  // re-check Connect after Stripe onboarding return/refresh
  useEffect(() => {
    const returnParam = searchParams?.get('return');
    const refreshParam = searchParams?.get('refresh');

    if (
      (returnParam === 'true' || refreshParam === 'true') &&
      authChecked &&
      isAuthenticated &&
      user?.role === 'VENDOR'
    ) {
      const refreshStatus = async () => {
        try {
          await checkStripeConnectStatus();
          router.replace('/vendor/payouts');
        } catch (error) {
          console.error('Error refreshing Stripe Connect status:', error);
        }
      };

      setTimeout(refreshStatus, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, authChecked, isAuthenticated, user?.role, router]);

  const createStripeConnectAccount = async () => {
    setCheckingStatus(true);
    let redirecting = false;

    try {
      const frontendBase =
        typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';

      const response = await vendorApiFetch('/vendors/stripe-connect/create', {
        method: 'POST',
        body: JSON.stringify({ frontendBase }),
      });

      if (response.status === 401) {
        setNotification({
          message: 'Your session expired. Redirecting to vendor login...',
          type: 'error',
        });
        setTimeout(() => {
          router.replace('/vendor/auth/login?redirect=/vendor/payouts');
        }, 1500);
        return;
      }

      if (response.status === 403) {
        setNotification({
          message: 'Only vendor accounts can set up Stripe Connect. Please log in with your vendor account.',
          type: 'error',
        });
        setTimeout(() => setNotification(null), 5000);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        const url = data.onboardingUrl || data.onboarding_url;
        if (url) {
          setOnboardingUrl(url);
          redirecting = true;
          window.location.assign(url);
          return;
        }
        setNotification({
          message: 'Stripe Connect setup started, but no onboarding link was returned. Please try again.',
          type: 'error',
        });
        setTimeout(() => setNotification(null), 5000);
        return;
      }

      const errorData = await response.json().catch(() => ({ message: 'Failed to create account' }));
      setNotification({
        message: errorData.message || `Failed to create Stripe Connect account (${response.status})`,
        type: 'error',
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (error: any) {
      console.error('Error creating Stripe Connect account:', error);
      const message =
        error?.name === 'AbortError'
          ? 'Stripe Connect setup timed out. Please try again.'
          : 'Failed to create Stripe Connect account. Please check your connection and try again.';
      setNotification({ message, type: 'error' });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      if (!redirecting) {
        setCheckingStatus(false);
      }
    }
  };


  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <VendorDashboardTopBar unreadCount={0} onOpenBidNotifications={() => {}} />
        <div className="pt-32 pb-20 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B1A33] mx-auto mb-4"></div>
            <p className="text-gray-600" style={{ fontFamily: 'Inter' }}>Loading...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // redirect runs in useEffect above
  if (!isAuthenticated || user?.role !== 'VENDOR') {
    return null;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `
      }} />
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            animation: 'slideInRight 0.3s ease-out',
          }}
        >
          <div
            style={{
              backgroundColor: notification.type === 'success' ? '#10b981' : '#ef4444',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minWidth: '320px',
              maxWidth: '400px',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {notification.type === 'success' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '15px' }}>
                {notification.type === 'success' ? 'Success!' : 'Error!'}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.95 }}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.8,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}
    <div className="min-h-screen bg-gray-50">
      <VendorDashboardTopBar unreadCount={0} onOpenBidNotifications={() => {}} />
      <div className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8" style={{ fontFamily: 'Raleway' }}>
            Payouts & Withdrawals
          </h1>

          {!stripeConnectEnabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-yellow-800 mb-2" style={{ fontFamily: 'Raleway' }}>
                    Stripe Connect Setup Required
                  </h3>
                  <p className="text-sm text-yellow-700 mb-4" style={{ fontFamily: 'Inter' }}>
                    You need to set up your Stripe Connect account to receive payouts. This will allow you to link your bank account and withdraw your earnings.
                  </p>
                  <button
                    onClick={createStripeConnectAccount}
                    disabled={checkingStatus}
                    className="px-6 py-2 bg-[#0B1A33] text-white rounded-lg hover:bg-[#122a4a] transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ fontFamily: 'Inter' }}
                  >
                    {checkingStatus ? 'Setting up...' : 'Set Up Stripe Connect'}
                  </button>
                  {onboardingUrl && (
                    <p className="mt-3 text-sm text-yellow-800" style={{ fontFamily: 'Inter' }}>
                      If you are not redirected automatically,{' '}
                      <a
                        href={onboardingUrl}
                        className="font-semibold underline text-[#0B1A33]"
                        target="_self"
                        rel="noopener noreferrer"
                      >
                        click here to continue Stripe setup
                      </a>
                      .
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-700 mb-1" style={{ fontFamily: 'Raleway' }}>
                  Available Balance
                </h2>
                <p className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Raleway' }}>
                  ${balance.toFixed(2)}
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-2" style={{ fontFamily: 'Inter' }}>
              This is your total earnings from completed work orders, minus any payouts already processed.
            </p>
            {stripeConnectEnabled && (
              <p className="text-sm text-blue-600 font-medium" style={{ fontFamily: 'Inter' }}>
                💰 This balance is readily available in your Stripe Connect account. You can withdraw directly from your Stripe dashboard.
              </p>
            )}
          </div>

        </div>
      </div>
      <Footer />
    </div>
    </>
  );
}

