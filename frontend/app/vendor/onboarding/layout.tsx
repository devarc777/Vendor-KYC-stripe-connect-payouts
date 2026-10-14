"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Footer } from "../../../components/TrustFooter";
import { getVendorAuthHeaders } from "@/lib/auth-utils";
import { useRoleContext } from "@/components/RoleContext";
import { resolveApiBaseUrl } from "@/lib/api-base";
import {
  loadVendorOnboardingDraft,
  mergeStepAllowance,
} from "@/lib/vendor-onboarding-draft";

const API_BASE = resolveApiBaseUrl();

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, authChecked } = useRoleContext();
  const [loading, setLoading] = useState(true);
  const [stepAllowed, setStepAllowed] = useState<{ business: boolean; docs: boolean; google: boolean; identity: boolean; aiTraining: boolean; review: boolean }>({ business: true, docs: false, google: false, identity: false, aiTraining: false, review: false });

  // logout prompt only on step 1 before they've actually started
  const [promptType, setPromptType] = useState<"user" | "vendor" | null>(null);
  const [onboardingStarted, setOnboardingStarted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      if (authChecked && isAuthenticated && user?.role) {
        if (user.role === 'VENDOR') setPromptType("vendor");
        else setPromptType("user");
      } else {
        setPromptType(null);
      }
      setOnboardingStarted(
        !!sessionStorage.getItem("vendor_onboarding_started") ||
          !!loadVendorOnboardingDraft()?.accountCreated,
      );
    };
    check();
    const t = setTimeout(check, 150);
    return () => clearTimeout(t);
  }, [pathname, authChecked, isAuthenticated, user?.role]);

  const isFirstStep = pathname === "/vendor/onboarding" || pathname.endsWith("/business");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isFirstStep) {
      sessionStorage.setItem("vendor_onboarding_started", "1");
      setOnboardingStarted(true);
    }
  }, [isFirstStep]);

  const showLogoutPrompt = promptType !== null && isFirstStep && !onboardingStarted;

  // match search/events header chrome
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('page-search-events');
      return () => document.body.classList.remove('page-search-events');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // logged in → show logout prompt; skip fetch/redirect
        if (authChecked && isAuthenticated) {
          if (mounted) setLoading(false);
          return;
        }
        // wait for auth so we don't bounce too early
        if (!authChecked) return;
        const res = await fetch(`${API_BASE}/vendors/onboarding`, {
          headers: getVendorAuthHeaders(),
          credentials: "include",
        });
        const data = res.ok ? await res.json() : null;
        const draft = loadVendorOnboardingDraft();
        const status = data?.onboardingStatus;
        // finished onboarding → home (unless we're showing the logout prompt)
        if (status && status !== 'NONE' && status !== 'IN_PROGRESS' && !(authChecked && isAuthenticated)) {
          router.replace('/');
          return;
        }
        const allow = { business: true, docs: false, google: false, identity: false, aiTraining: false, review: false } as any;
        if (data?.vendor?.businessName) allow.docs = true;
        if (data?.vendor?.documents) allow.google = true;
        if (data?.vendor?.googleBusinessUrl) allow.identity = true;
        // AI step unlocks once identity started/verified, or after google (skip path)
        if (data?.vendor?.stripeVerificationStatus && data?.vendor?.stripeVerificationStatus !== 'NOT_STARTED') allow.aiTraining = true;
        if (data?.vendor?.stripeVerificationStatus === 'VERIFIED') allow.aiTraining = true;
        if (data?.vendor?.googleBusinessUrl) allow.aiTraining = true;
        if (allow.aiTraining) allow.review = true;
        const merged = mergeStepAllowance(allow, draft);
        if (mounted) setStepAllowed(merged);
        // keep them on an allowed step
        if (pathname.endsWith('/docs') && !merged.docs) router.replace('/vendor/onboarding/business');
        if (pathname.endsWith('/google') && !merged.google) router.replace('/vendor/onboarding/docs');
        if (pathname.endsWith('/identity') && !merged.identity) router.replace('/vendor/onboarding/google');
        if (pathname.endsWith('/ai-training') && !merged.aiTraining) router.replace('/vendor/onboarding/identity');
        if (pathname.endsWith('/review') && !merged.review) router.replace('/vendor/onboarding/ai-training');
      } catch {}
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [pathname, authChecked, isAuthenticated]);

  const steps = [
    { key: 'business', label: 'Business Info', href: '/vendor/onboarding/business' },
    { key: 'docs', label: 'Docs Upload', href: '/vendor/onboarding/docs' },
    { key: 'google', label: 'Google Link', href: '/vendor/onboarding/google' },
    { key: 'identity', label: 'Verify Identity', href: '/vendor/onboarding/identity' },
    { key: 'aiTraining', label: 'AI Onboarding', href: '/vendor/onboarding/ai-training' },
    { key: 'review', label: 'Review & Submit', href: '/vendor/onboarding/review' },
  ] as const;

  return (
    <>
      <style jsx>{`
        /* desktop */
        @media (min-width: 1200px) {
          .onboarding-main-container {
            flex-direction: row !important;
          }
          .onboarding-sidebar {
            width: 300px !important;
            min-height: 500px !important;
            border-radius: 16px 0 0 16px !important;
          }
          .onboarding-steps-wrapper {
            flex-direction: column !important;
            padding-top: 10px !important;
          }
          .onboarding-step-item {
            flex-direction: column !important;
          }
          .onboarding-step-separator {
            width: 2px !important;
            height: 25px !important;
            margin: 8px 0 !important;
          }
          .onboarding-form-container {
            padding: 40px !important;
          }
        }

        /* tablet */
        @media (min-width: 768px) and (max-width: 1199px) {
          .onboarding-main-container {
            flex-direction: row !important;
          }
          .onboarding-sidebar {
            width: 25% !important;
            min-width: 200px !important;
            border-radius: 16px 0 0 16px !important;
          }
          .onboarding-steps-wrapper {
            flex-direction: column !important;
            padding-top: 10px !important;
          }
          .onboarding-step-item {
            flex-direction: column !important;
          }
          .onboarding-step-separator {
            width: 2px !important;
            height: 25px !important;
            margin: 8px 0 !important;
          }
          .onboarding-form-container {
            flex: 1 !important;
            padding: 30px !important;
          }
        }

        /* mobile */
        @media (max-width: 767px) {
          .onboarding-main-container {
            flex-direction: column !important;
            height: auto !important;
            min-height: 600px !important;
          }
          .onboarding-sidebar {
            width: 100% !important;
            min-height: auto !important;
            border-radius: 16px 16px 0 0 !important;
            padding: 20px 8px !important;
          }
          .onboarding-steps-wrapper {
            flex-direction: row !important;
            justify-content: space-between !important;
            padding-top: 0 !important;
            gap: 2px !important;
          }
          .onboarding-step-item {
            flex-direction: column !important;
            flex: 1 !important;
            min-width: 0 !important;
          }
          .onboarding-step-separator {
            width: 12px !important;
            height: 2px !important;
            margin: 0 2px !important;
            align-self: flex-start !important;
            margin-top: 22px !important;
          }
          .onboarding-step-circle {
            width: 28px !important;
            height: 28px !important;
            font-size: 10px !important;
          }
          .onboarding-step-label {
            font-size: 6.5px !important;
            max-width: 38px !important;
            line-height: 1.0 !important;
            text-align: center !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            white-space: normal !important;
            hyphens: auto !important;
          }
          .onboarding-form-container {
            flex: 1 !important;
            padding: 24px 16px !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50" style={{ paddingTop: '120px', paddingBottom: '40px' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {showLogoutPrompt ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 sm:p-10 text-center max-w-lg mx-auto mt-10">
              <p className="text-gray-800 text-lg mb-4">
                {promptType === "user"
                  ? "Please log out as user first before completing vendor onboarding."
                  : "Please log out as vendor first before completing vendor onboarding."}
              </p>
              <Link
                href={promptType === "user" ? "/" : "/vendor/dashboard"}
                className="inline-block px-6 py-3 bg-[#0B1A33] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                {promptType === "user" ? "Go to homepage to log out" : "Go to vendor dashboard to log out"}
              </Link>
            </div>
          ) : (
          <>
          <div 
            className="bg-white flex onboarding-main-container"
            style={{
              width: '100%',
              height: pathname?.endsWith('/review') ? '1090px' : pathname?.endsWith('/ai-training') ? '1050px' : '650px',
              borderRadius: '16px',
              opacity: 1,
              border: '1px solid #E5E7EB',
              background: '#FFFFFF',
              boxShadow: '0px 13px 32px -24px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              marginTop: '40px'
            }}
          >
            {/* step rail */}
            <div 
              className="onboarding-sidebar"
              style={{
                width: '300px',
                minHeight: '500px',
                borderRadius: '16px 0 0 16px',
                opacity: 1,
                background: '#0B1A33',
                padding: '40px 20px'
              }}
            >
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-white text-sm">Loading...</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center onboarding-steps-wrapper" style={{ paddingTop: '10px', height: '100%' }}>
                  {steps.map((s, idx) => {
                    const active = pathname.endsWith(s.key);
                    const enabled = (stepAllowed as any)[s.key];
                    const completed = idx < steps.findIndex(st => pathname.endsWith(st.key));
                    
                    return (
                      <div key={s.key} className="flex flex-col items-center onboarding-step-item">
                        <Link 
                          href={enabled ? s.href : '#'} 
                          className={`flex flex-col items-center transition-all ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                        >
                          <div 
                            className="rounded-full flex items-center justify-center font-semibold text-lg shadow-md transition-all onboarding-step-circle"
                            style={{
                              width: '45px',
                              height: '45px',
                              backgroundColor: active ? '#D4AF37' : 'transparent',
                              border: '1px solid #D4AF37',
                              color: active ? '#000000' : '#ffffff'
                            }}
                          >
                            {completed ? '✓' : idx + 1}
                          </div>
                          <span 
                            className="text-xs font-medium mt-1 text-center onboarding-step-label"
                            style={{
                              color: active ? '#ffffff' : (enabled ? '#ffffff' : '#9ca3af'),
                              fontWeight: active ? 700 : 500,
                              maxWidth: '80px'
                            }}
                          >
                            {s.label}
                          </span>
                        </Link>
                        {idx < steps.length - 1 && (
                          <div 
                            className="onboarding-step-separator"
                            style={{
                              width: '2px',
                              height: '25px',
                              backgroundColor: '#8897AD',
                              margin: '8px 0'
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* step form */}
            <div 
              className="onboarding-form-container"
              style={{
                flex: 1,
                minHeight: '500px',
                opacity: 1,
                padding: '40px',
                overflow: 'hidden'
              }}
            >
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 text-sm">Loading...</p>
                  </div>
                </div>
              ) : (
                children
              )}
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}


