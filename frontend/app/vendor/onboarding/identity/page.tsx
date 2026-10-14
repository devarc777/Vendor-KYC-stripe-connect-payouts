"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getVendorAuthHeaders } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";
import { saveVendorOnboardingDraft } from "@/lib/vendor-onboarding-draft";

const API_BASE = resolveApiBaseUrl();

export default function IdentityVerificationStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('NOT_STARTED');
  const [error, setError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    checkVerificationStatus();
  }, []);

  async function checkVerificationStatus() {
    try {
      const res = await fetch(`${API_BASE}/vendors/verification/status`, {
        credentials: 'include',
        headers: getVendorAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const nextStatus = data.status || 'NOT_STARTED';
        setStatus(nextStatus);
        saveVendorOnboardingDraft({
          currentStep: '/vendor/onboarding/identity',
          identity: { stripeVerificationStatus: nextStatus },
        });
        setError(null);
      }
    } catch (err) {
      console.error('Failed to check status:', err);
    } finally {
      setCheckingStatus(false);
    }
  }

  async function handleVerifyIdentity() {
    setLoading(true);
    setError(null);
    
    try {
      // create or reuse a Stripe Identity session
      const res = await fetch(`${API_BASE}/vendors/verification/create-session`, {
        method: 'POST',
        headers: getVendorAuthHeaders(),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to create verification session');
      }

      const data = await res.json();

      if (data.status === 'already_verified') {
        setStatus('VERIFIED');
        setError(null);
        return;
      }

      // hand off to Stripe-hosted verification
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No verification URL received');
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err?.message || 'Failed to start verification');
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    saveVendorOnboardingDraft({ currentStep: '/vendor/onboarding/ai-training' });
    router.push('/vendor/onboarding/ai-training');
  }

  async function handleSkip() {
    saveVendorOnboardingDraft({
      currentStep: '/vendor/onboarding/ai-training',
      identity: { stripeVerificationStatus: status },
    });
    router.push('/vendor/onboarding/ai-training');
  }

  if (checkingStatus) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 text-sm">Checking verification status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        /* mobile layout tweaks */
        @media (max-width: 767px) {
          .identity-card-flex {
            flex-direction: column !important;
            gap: 16px !important;
          }
          .identity-icon-wrapper {
            padding: 12px !important;
          }
          .identity-icon-wrapper svg {
            width: 24px !important;
            height: 24px !important;
          }
          .identity-title {
            font-size: 18px !important;
          }
          .identity-description {
            font-size: 14px !important;
          }
          .identity-button-group {
            flex-direction: column !important;
            width: 100% !important;
          }
          .identity-button-group button {
            width: 100% !important;
            justify-content: center !important;
          }
          .identity-info-box {
            padding: 12px !important;
          }
          .identity-step-item {
            flex-direction: row !important;
            align-items: flex-start !important;
          }
          .identity-step-circle {
            width: 28px !important;
            height: 28px !important;
            font-size: 12px !important;
          }
          .identity-step-text h4 {
            font-size: 14px !important;
          }
          .identity-step-text p {
            font-size: 12px !important;
          }
        }
      `}</style>
      <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Identity Verification</h2>
        <p className="text-gray-600">Verify your identity to complete your vendor profile</p>
      </div>

      {status === 'VERIFIED' ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-green-900 mb-1">Identity Verified</h3>
              <p className="text-sm text-green-800">
                Your identity has been successfully verified. You can proceed to the next step of onboarding.
              </p>
            </div>
          </div>
        </div>
      ) : status === 'PROCESSING' || status === 'REQUIRES_INPUT' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-blue-900 mb-1">
                {status === 'PROCESSING' ? 'Verification in Progress' : 'Verification Requires Input'}
              </h3>
              <p className="text-sm text-blue-800">
                {status === 'PROCESSING' 
                  ? 'Your verification is being processed. Click below to continue or check your verification status.'
                  : 'Your verification needs additional information. Click below to complete the verification process.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-green-800">
              <p className="font-semibold mb-1">How Identity Verification Works</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>You uploaded your government ID and business license</li>
                <li>You verified your Google Business Profile</li>
                <li>Click "Verify Now" to complete final identity verification</li>
                <li>Our system will review your documents and verify your identity</li>
                <li>Once approved, you can start offering your services</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push('/vendor/onboarding/google')}
          className="flex items-center gap-2 px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{
            backgroundColor: 'transparent',
            borderRadius: '35px',
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: '16px',
            lineHeight: '100%',
            letterSpacing: '0px',
            color: '#0B1A33',
            border: '2px solid #D4AF37',
            cursor: 'pointer'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 8H1M1 8L8 1M1 8L8 15" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Back</span>
        </button>

        <div className="flex gap-3">
          {status === 'VERIFIED' ? (
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-8 py-3 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              style={{
                backgroundColor: '#D4AF37',
                borderRadius: '35px',
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '16px',
                lineHeight: '100%',
                letterSpacing: '0px',
                color: '#0B1A33',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>Continue to AI Onboarding</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 8H15M15 8L8 1M15 8L8 15" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="flex items-center gap-2 px-8 py-3 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                style={{
                  backgroundColor: '#E5E7EB',
                  borderRadius: '35px',
                  fontFamily: 'Inter',
                  fontWeight: 700,
                  fontSize: '16px',
                  lineHeight: '100%',
                  letterSpacing: '0px',
                  color: '#374151',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                <span>Skip for Now</span>
              </button>

              <button
                onClick={handleVerifyIdentity}
                disabled={loading}
                className="flex items-center gap-2 px-8 py-3 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                style={{
                  backgroundColor: '#D4AF37',
                  borderRadius: '35px',
                  fontFamily: 'Inter',
                  fontWeight: 700,
                  fontSize: '16px',
                  lineHeight: '100%',
                  letterSpacing: '0px',
                  color: '#0B1A33',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>{status === 'PROCESSING' || status === 'REQUIRES_INPUT' ? 'Continue Verification' : 'Verify Now'}</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 8H15M15 8L8 1M15 8L8 15" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-red-700 font-medium">{error}</span>
        </div>
      )}
      </div>
    </>
  );
}

