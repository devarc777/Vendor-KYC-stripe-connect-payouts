"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getVendorAuthHeaders } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";
import {
  loadVendorOnboardingDraft,
  saveVendorOnboardingDraft,
} from "@/lib/vendor-onboarding-draft";

const API_BASE = resolveApiBaseUrl();

export default function GoogleStep() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const loadExistingData = async () => {
      const draft = loadVendorOnboardingDraft();
      if (draft?.google?.url) setUrl(draft.google.url);
      try {
        const res = await fetch(`${API_BASE}/vendors/onboarding`, {
          credentials: "include",
          headers: getVendorAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.vendor?.googleBusinessUrl) {
            setUrl(data.vendor.googleBusinessUrl);
          }
        }
      } catch (error) {
        console.error('Error loading existing data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    loadExistingData();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vendors/onboarding/google/verify`, {
        method: 'POST', headers: getVendorAuthHeaders(), credentials: 'include',
        body: JSON.stringify({ googleBusinessUrl: url })
      });
      if (!res.ok) throw new Error('Failed');
      saveVendorOnboardingDraft({
        currentStep: '/vendor/onboarding/identity',
        google: { url },
      });
      router.push('/vendor/onboarding/identity');
    } catch { setMsg('Failed to verify, check URL and try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Google Business Profile</h2>
        <p className="text-gray-600">Link your Google Business Profile to verify your business</p>
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        {msg && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-red-700 font-medium">{msg}</span>
          </div>
        )}

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-green-800">
              <p className="font-semibold mb-1">How to find your Google Business URL</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Search for your business on Google Maps</li>
                <li>Click on your business listing</li>
                <li>Copy the URL from your browser (it should contain "cid=" or similar)</li>
              </ol>
            </div>
          </div>
        </div>
        
        <label className="block">
          <span className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Google Business Profile URL *
          </span>
          <input 
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none" 
            value={url} 
            onChange={(e) => setUrl(e.target.value)} 
            placeholder="https://www.google.com/maps?cid=..." 
            required 
          />
          <p className="text-xs text-gray-500 mt-2">This helps us verify your business authenticity</p>
        </label>

        <div className="flex justify-between pt-4">
          <button 
            type="button"
            onClick={() => router.push('/vendor/onboarding/docs')}
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
            type="submit"
            disabled={loading || loadingData} 
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
              cursor: loading || loadingData ? 'not-allowed' : 'pointer'
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
                <span>Verify & Continue</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 8H15M15 8L8 1M15 8L8 15" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}


