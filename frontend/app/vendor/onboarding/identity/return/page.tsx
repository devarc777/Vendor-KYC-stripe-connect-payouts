"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getVendorAuthHeaders } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";
import { saveVendorOnboardingDraft } from "@/lib/vendor-onboarding-draft";

const API_BASE = resolveApiBaseUrl();

export default function VerificationReturnPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'verified' | 'pending' | 'failed'>('checking');

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      // give the Identity webhook a moment to land
      await new Promise(resolve => setTimeout(resolve, 3000));

      const res = await fetch(`${API_BASE}/vendors/verification/status`, {
        credentials: 'include',
        headers: getVendorAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Verification status:', data);
        saveVendorOnboardingDraft({
          identity: { stripeVerificationStatus: data.status },
        });

        if (data.status === 'VERIFIED') {
          setStatus('verified');
          setTimeout(() => {
            router.push('/vendor/onboarding/ai-training');
          }, 2000);
        } else if (data.status === 'PROCESSING' || data.status === 'PENDING') {
          setStatus('pending');
          setTimeout(() => {
            router.push('/vendor/onboarding/identity');
          }, 3000);
        } else {
          console.log('Verification failed, status:', data.status);
          setStatus('failed');
          setTimeout(() => {
            router.push('/vendor/onboarding/identity');
          }, 3000);
        }
      } else {
        console.log('Failed to fetch status, response:', res.status);
        setStatus('failed');
        setTimeout(() => {
          router.push('/vendor/onboarding/identity');
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to check status:', error);
      setStatus('failed');
      setTimeout(() => {
        router.push('/vendor/onboarding/identity');
      }, 3000);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center">
            {status === 'checking' && (
              <>
                <div className="w-20 h-20 mx-auto mb-6">
                  <svg className="animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Checking Verification Status</h2>
                <p className="text-gray-600">Please wait while we verify your information...</p>
              </>
            )}
            
            {status === 'verified' && (
              <>
                <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-green-900 mb-2">Verification Successful!</h2>
                <p className="text-gray-600">Your identity has been verified. Redirecting...</p>
              </>
            )}
            
            {status === 'pending' && (
              <>
                <div className="w-20 h-20 mx-auto mb-6 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-yellow-900 mb-2">Verification In Progress</h2>
                <p className="text-gray-600">Your verification is being processed. This may take a few moments...</p>
              </>
            )}
            
            {status === 'failed' && (
              <>
                <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-red-900 mb-2">Verification Issue</h2>
                <p className="text-gray-600">There was an issue with verification. Redirecting back...</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

