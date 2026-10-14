"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getVendorAuthHeaders, setVendorSessionToken } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";
import {
  loadVendorOnboardingDraft,
  saveVendorOnboardingDraft,
} from "@/lib/vendor-onboarding-draft";

function getApiBase(): string {
  return resolveApiBaseUrl();
}

async function vendorLogin(
  email: string,
  password: string,
): Promise<boolean> {
  const res = await fetch(`${getApiBase()}/auth/login`, {
    method: "POST",
    headers: getVendorAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ email, password, role: "VENDOR" }),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  if (data?.token) {
    setVendorSessionToken(data.token);
  }
  return true;
}

async function hasVendorSession(): Promise<boolean> {
  const res = await fetch(`${getApiBase()}/auth/me`, {
    headers: getVendorAuthHeaders(),
    credentials: "include",
  });
  return res.ok;
}

export default function BusinessStep() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("CATERING");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [hasExistingVendor, setHasExistingVendor] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistDraft = useCallback(() => {
    saveVendorOnboardingDraft({
      currentStep: "/vendor/onboarding/business",
      accountCreated,
      business: {
        businessName,
        category,
        email,
        phone,
        city,
        description,
      },
    });
  }, [
    accountCreated,
    businessName,
    category,
    email,
    phone,
    city,
    description,
  ]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (loadingData) return;
    saveTimer.current = setTimeout(persistDraft, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persistDraft, loadingData]);

  useEffect(() => {
    const loadExistingData = async () => {
      const draft = loadVendorOnboardingDraft();
      if (draft?.business) {
        const b = draft.business;
        if (b.businessName) setBusinessName(b.businessName);
        if (b.category) setCategory(b.category);
        if (b.email) setEmail(b.email);
        if (b.phone) setPhone(b.phone);
        if (b.city) setCity(b.city);
        if (b.description) setDescription(b.description);
      }
      if (draft?.accountCreated) setAccountCreated(true);

      try {
        const res = await fetch(`${getApiBase()}/vendors/onboarding`, {
          headers: getVendorAuthHeaders(),
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.vendor) {
            setHasExistingVendor(true);
            setAccountCreated(true);
            if (data.vendor.businessName)
              setBusinessName(data.vendor.businessName);
            if (data.vendor.category) setCategory(data.vendor.category);
            if (data.vendor.email) setEmail(data.vendor.email);
            if (data.vendor.phone) setPhone(data.vendor.phone || "");
            if (data.vendor.city) setCity(data.vendor.city || "");
            if (data.vendor.description)
              setDescription(data.vendor.description || "");
          } else if (data?.onboardingStatus === "IN_PROGRESS") {
            setAccountCreated(true);
          }
        } else if (draft?.accountCreated) {
          setHasExistingVendor(true);
        }
      } catch (error) {
        console.error("Error loading existing data:", error);
        if (draft?.accountCreated) setHasExistingVendor(true);
      } finally {
        setLoadingData(false);
      }
    };

    loadExistingData();
  }, []);

  async function saveBusinessInfo() {
    return fetch(`${getApiBase()}/vendors/onboarding/business`, {
      method: "POST",
      headers: getVendorAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({
        businessName,
        category,
        email,
        phone,
        city,
        description,
      }),
    });
  }

  async function ensureVendorAccount(): Promise<void> {
    const needsAccount = !hasExistingVendor && !accountCreated;

    if (needsAccount) {
      const signupRes = await fetch(`${getApiBase()}/auth/register`, {
        method: "POST",
        headers: getVendorAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          name: businessName,
          fullName: businessName,
          email,
          password,
          role: "VENDOR",
        }),
      });

      if (!signupRes.ok) {
        const error = await signupRes.json().catch(() => null);
        const errorMsg = error?.message || "Failed to create account";
        if (
          errorMsg.toLowerCase().includes("already registered") ||
          errorMsg.toLowerCase().includes("already exists")
        ) {
          if (!password) {
            throw new Error(
              "This email is already registered. Enter your password to continue onboarding.",
            );
          }
          const loggedIn = await vendorLogin(email, password);
          if (!loggedIn) {
            throw new Error(
              "Email already registered. Enter the correct password to continue.",
            );
          }
          setAccountCreated(true);
          setHasExistingVendor(true);
          saveVendorOnboardingDraft({ accountCreated: true });
          return;
        }
        throw new Error(errorMsg);
      }

      await signupRes.json();
      setAccountCreated(true);
      saveVendorOnboardingDraft({ accountCreated: true });
      return;
    }

    const sessionOk = await hasVendorSession();
    if (!sessionOk) {
      if (!password) {
        throw new Error(
          "Welcome back — enter your password to continue vendor onboarding.",
        );
      }
      const loggedIn = await vendorLogin(email, password);
      if (!loggedIn) {
        throw new Error("Could not sign in. Check your password and try again.");
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await ensureVendorAccount();

      let businessRes = await saveBusinessInfo();
      if (businessRes.status === 401 && password) {
        const loggedIn = await vendorLogin(email, password);
        if (loggedIn) businessRes = await saveBusinessInfo();
      }

      if (!businessRes.ok) {
        const err = await businessRes.json().catch(() => null);
        throw new Error(err?.message || "Failed to save business info");
      }

      saveVendorOnboardingDraft({
        accountCreated: true,
        currentStep: "/vendor/onboarding/docs",
        business: {
          businessName,
          category,
          email,
          phone,
          city,
          description,
        },
      });

      router.push("/vendor/onboarding/docs");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save, try again.";
      setMsg(message);
    } finally {
      setLoading(false);
    }
  }

  const showAsReturning =
    hasExistingVendor || accountCreated;

  return (
    <>
      <style jsx>{`
        @media (min-width: 768px) and (max-width: 1199px) {
          .onboarding-form-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 767px) {
          .onboarding-form-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div className="space-y-6">
        <div>
          <h2
            style={{
              fontFamily: "Raleway",
              fontWeight: 600,
              fontSize: "32px",
              lineHeight: "100%",
              letterSpacing: "0px",
              color: "#0B1A33",
              marginBottom: "16px",
            }}
          >
            Business Info
          </h2>
          <p
            style={{
              fontFamily: "Inter",
              fontWeight: 300,
              fontSize: "16px",
              lineHeight: "100%",
              letterSpacing: "0px",
              color: "#616161",
            }}
          >
            Tell us a bit about your business — who you are, what you do, and how
            clients can reach you. This helps us set up your vendor profile on
            Evenzs.
          </p>
          {showAsReturning && (
            <p
              className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2"
              style={{ fontFamily: "Inter" }}
            >
              Picking up where you left off — your progress is saved. Enter your
              password if prompted to continue.
            </p>
          )}
        </div>

        <form className="space-y-5" onSubmit={onSubmit}>
          {msg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-600 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm text-red-700 font-medium">{msg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 onboarding-form-grid">
            <label className="block">
              <span
                className="mb-2 block"
                style={{
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              >
                Business Name *
              </span>
              <input
                className="w-full outline-none"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Enter your business name"
                required
                style={{
                  height: "48px",
                  borderRadius: "50px",
                  opacity: 1,
                  borderWidth: "1px",
                  backgroundColor: "#F7FBFF",
                  border: "1px solid #D4D7E3",
                  paddingLeft: "20px",
                  paddingRight: "20px",
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              />
            </label>

            <label className="block">
              <span
                className="mb-2 block"
                style={{
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              >
                {showAsReturning ? "Password *" : "Password *"}
              </span>
              <input
                className="w-full outline-none"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  showAsReturning
                    ? "Enter your password to continue"
                    : "Create a password"
                }
                required
                style={{
                  height: "48px",
                  borderRadius: "50px",
                  opacity: 1,
                  borderWidth: "1px",
                  backgroundColor: "#F7FBFF",
                  border: "1px solid #D4D7E3",
                  paddingLeft: "20px",
                  paddingRight: "20px",
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              />
            </label>
          </div>

          <label className="block">
            <span
              className="mb-2 block"
              style={{
                fontFamily: "Roboto",
                fontWeight: 400,
                fontSize: "16px",
                lineHeight: "100%",
                letterSpacing: "1%",
                color: "#0C1421",
              }}
            >
              Description
            </span>
            <textarea
              className="w-full outline-none resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your business and services"
              rows={3}
              style={{
                height: "80px",
                borderRadius: "12px",
                opacity: 1,
                borderWidth: "1px",
                backgroundColor: "#F7FBFF",
                border: "1px solid #D4D7E3",
                paddingLeft: "20px",
                paddingRight: "20px",
                paddingTop: "12px",
                paddingBottom: "12px",
                fontFamily: "Roboto",
                fontWeight: 400,
                fontSize: "16px",
                lineHeight: "140%",
                letterSpacing: "1%",
                color: "#0C1421",
              }}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 onboarding-form-grid">
            <label className="block">
              <span
                className="mb-2 block"
                style={{
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              >
                {showAsReturning
                  ? "Login Email (cannot change here)"
                  : "Email *"}
              </span>
              <input
                className="w-full outline-none"
                type="email"
                value={email}
                onChange={(e) => !showAsReturning && setEmail(e.target.value)}
                placeholder="business@example.com"
                required
                disabled={showAsReturning}
                style={{
                  height: "48px",
                  borderRadius: "50px",
                  opacity: 1,
                  borderWidth: "1px",
                  backgroundColor: showAsReturning ? "#E5E7EB" : "#F7FBFF",
                  border: "1px solid #D4D7E3",
                  paddingLeft: "20px",
                  paddingRight: "20px",
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              />
            </label>
            <label className="block">
              <span
                className="mb-2 block"
                style={{
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              >
                Phone
              </span>
              <input
                className="w-full outline-none"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                style={{
                  height: "48px",
                  borderRadius: "50px",
                  opacity: 1,
                  borderWidth: "1px",
                  backgroundColor: "#F7FBFF",
                  border: "1px solid #D4D7E3",
                  paddingLeft: "20px",
                  paddingRight: "20px",
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 onboarding-form-grid">
            <label className="block">
              <span
                className="mb-2 block"
                style={{
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              >
                City
              </span>
              <input
                className="w-full outline-none"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="New York"
                style={{
                  height: "48px",
                  borderRadius: "50px",
                  opacity: 1,
                  borderWidth: "1px",
                  backgroundColor: "#F7FBFF",
                  border: "1px solid #D4D7E3",
                  paddingLeft: "20px",
                  paddingRight: "20px",
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              />
            </label>
            <label className="block">
              <span
                className="mb-2 block"
                style={{
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              >
                Category *
              </span>
              <select
                className="w-full outline-none"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  height: "48px",
                  borderRadius: "50px",
                  opacity: 1,
                  borderWidth: "1px",
                  backgroundColor: "#F7FBFF",
                  border: "1px solid #D4D7E3",
                  paddingLeft: "20px",
                  paddingRight: "20px",
                  fontFamily: "Roboto",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "100%",
                  letterSpacing: "1%",
                  color: "#0C1421",
                }}
              >
                {[
                  "CATERING",
                  "PHOTOGRAPHY",
                  "VIDEography",
                  "MUSIC_DJ",
                  "DECORATION",
                  "FLOWERS",
                  "TRANSPORTATION",
                  "SECURITY",
                  "CLEANING",
                  "EQUIPMENT_RENTAL",
                  "VENUE",
                  "OTHER",
                ].map((c) => (
                  <option
                    key={c}
                    value={c}
                    style={{
                      fontFamily: "Roboto",
                      fontWeight: 400,
                      fontSize: "16px",
                      letterSpacing: "1%",
                      color: "#0C1421",
                    }}
                  >
                    {c.replace("_", " / ")}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{
                backgroundColor: "transparent",
                borderRadius: "35px",
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: "16px",
                lineHeight: "100%",
                letterSpacing: "0px",
                color: "#0B1A33",
                border: "2px solid #D4AF37",
                cursor: "pointer",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M15 8H1M1 8L8 1M1 8L8 15"
                  stroke="#0B1A33"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Back</span>
            </button>

            <button
              type="submit"
              disabled={loading || loadingData}
              className="flex items-center gap-2 px-8 py-3 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              style={{
                backgroundColor: "#D4AF37",
                borderRadius: "35px",
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: "16px",
                lineHeight: "100%",
                letterSpacing: "0px",
                color: "#0B1A33",
                border: "none",
                cursor: loading || loadingData ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Next</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 8H15M15 8L8 1M15 8L8 15"
                      stroke="#0B1A33"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
