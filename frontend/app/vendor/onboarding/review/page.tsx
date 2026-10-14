"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getVendorAuthHeaders } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";
import { clearVendorOnboardingDraft } from "@/lib/vendor-onboarding-draft";

const API_BASE = resolveApiBaseUrl();

export default function ReviewStep() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [aiProfile, setAiProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [onboardingRes, aiProfileRes] = await Promise.all([
          fetch(`${API_BASE}/vendors/onboarding`, { credentials: 'include', headers: getVendorAuthHeaders() }),
          fetch(`${API_BASE}/vendors/onboarding/ai/profile`, { credentials: 'include', headers: getVendorAuthHeaders() }).catch(() => null),
        ]);
        
        const json = await onboardingRes.json();
        setData(json);
        
        if (aiProfileRes && aiProfileRes.ok) {
          const aiData = await aiProfileRes.json();
          if (aiData && aiData.aiOnboardingCompleted) {
            setAiProfile(aiData);
          }
        }
      } catch { setError('Failed to load.'); }
      finally { setLoading(false); }
    })();
  }, []);

  async function onSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/vendors/onboarding/submit`, { method: 'POST', credentials: 'include', headers: getVendorAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      clearVendorOnboardingDraft();
      router.push('/vendor/dashboard');
    } catch { setError('Failed to submit.'); }
    finally { setSubmitting(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
      <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      <span className="text-sm text-red-700 font-medium">{error}</span>
    </div>
  );

  const vendor = data?.vendor;
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Review & Submit</h2>
        <p className="text-sm text-gray-600">Review your information before submitting for approval</p>
      </div>

      <div className="space-y-3">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="text-sm font-bold text-gray-900">Business Information</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex flex-col">
              <span className="text-gray-600 font-medium mb-1">Name</span>
              <span className="font-semibold text-gray-900 truncate">{vendor?.businessName || '-'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-600 font-medium mb-1">Category</span>
              <span className="font-semibold text-gray-900 truncate">{vendor?.category?.replace('_', ' / ') || '-'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-600 font-medium mb-1">Email</span>
              <span className="font-semibold text-gray-900 truncate">{vendor?.email || '-'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-600 font-medium mb-1">Phone</span>
              <span className="font-semibold text-gray-900">{vendor?.phone || '-'}</span>
            </div>
            <div className="flex flex-col col-span-2">
              <span className="text-gray-600 font-medium mb-1">City</span>
              <span className="font-semibold text-gray-900">{vendor?.city || '-'}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-4 border border-green-100">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-sm font-bold text-gray-900">Documents</h3>
          </div>
          <div className="space-y-1.5">
            {vendor?.documents && vendor.documents.length > 0 ? (
              vendor.documents.map((doc: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 bg-white rounded-md p-2">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900">{doc.type}</p>
                    <p className="text-xs text-gray-500 truncate">{doc.url?.split('/').pop() || doc.url}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500">No documents uploaded</p>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-sm font-bold text-gray-900">Google Business Profile</h3>
          </div>
          <div className="grid gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">Status</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                ✓ Verified
              </span>
            </div>
            {vendor?.googleBusinessUrl && (
              <div className="flex justify-between items-start gap-2">
                <span className="text-gray-600 font-medium flex-shrink-0">URL</span>
                <a href={vendor?.googleBusinessUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline text-right text-xs">
                  View Profile →
                </a>
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-lg p-4 border ${
          vendor?.stripeVerificationStatus === 'VERIFIED' 
            ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' 
            : vendor?.stripeVerificationStatus === 'PROCESSING'
            ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200'
            : 'bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-200'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {vendor?.stripeVerificationStatus === 'VERIFIED' ? (
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
              </svg>
            )}
            <h3 className="text-sm font-bold text-gray-900">Identity Verification</h3>
          </div>
          <div className="grid gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">Status</span>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                vendor?.stripeVerificationStatus === 'VERIFIED' 
                  ? 'bg-green-100 text-green-800' 
                  : vendor?.stripeVerificationStatus === 'PROCESSING'
                  ? 'bg-blue-100 text-blue-800'
                  : vendor?.stripeVerificationStatus === 'NOT_STARTED'
                  ? 'bg-gray-100 text-gray-800'
                  : 'bg-orange-100 text-orange-800'
              }`}>
                {vendor?.stripeVerificationStatus === 'VERIFIED' && '✓ Verified'}
                {vendor?.stripeVerificationStatus === 'PROCESSING' && 'Processing...'}
                {vendor?.stripeVerificationStatus === 'NOT_STARTED' && 'Not Started'}
                {vendor?.stripeVerificationStatus === 'REQUIRES_INPUT' && 'Requires Input'}
                {vendor?.stripeVerificationStatus === 'FAILED' && 'Failed'}
                {vendor?.stripeVerificationStatus === 'CANCELED' && 'Canceled'}
                {!vendor?.stripeVerificationStatus && 'Not Started'}
              </span>
            </div>
            {vendor?.verifiedAt && (
              <div className="flex justify-between">
                <span className="text-gray-600 font-medium">Verified On</span>
                <span className="font-semibold text-gray-900 text-xs">
                  {new Date(vendor.verifiedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {aiProfile && aiProfile.aiOnboardingCompleted && (
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <h3 className="text-sm font-bold text-gray-900">AI-Generated Profile</h3>
            </div>
            <div className="space-y-2.5">
              {aiProfile.aiPersona && (
                <div>
                  <span className="text-xs text-gray-500 mb-0.5 block">Persona</span>
                  <p className="text-sm font-semibold text-blue-700">{aiProfile.aiPersona}</p>
                </div>
              )}

              {aiProfile.aiTags && aiProfile.aiTags.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500 mb-1.5 block">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {aiProfile.aiTags.map((tag: string, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-medium text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {aiProfile.aiConfidenceScore !== null && aiProfile.aiConfidenceScore !== undefined && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">AI Confidence</span>
                    <span className="text-xs font-bold text-blue-600">
                      {Math.round(aiProfile.aiConfidenceScore * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${aiProfile.aiConfidenceScore * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-3">
        <button 
          type="button"
          onClick={() => router.push('/vendor/onboarding/ai-training')}
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

        <button 
          onClick={onSubmit} 
          disabled={submitting} 
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
            cursor: submitting ? 'not-allowed' : 'pointer'
          }}
        >
          {submitting ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <span>Submit for Approval</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 8H15M15 8L8 1M15 8L8 15" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}


