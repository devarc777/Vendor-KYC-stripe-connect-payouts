"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Toast from "../../../../components/Toast";
import { getVendorAuthHeaders } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";
import {
  loadVendorOnboardingDraft,
  saveVendorOnboardingDraft,
} from "@/lib/vendor-onboarding-draft";

const API_BASE = resolveApiBaseUrl();

export default function DocsStep() {
  const router = useRouter();
  const [idFile, setIdFile] = useState<File | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  // S3 URLs from /uploads (or restored from draft/vendor)
  const [idUrl, setIdUrl] = useState("");
  const [licenseUrl, setLicenseUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"error" | "success">("error");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const loadExistingData = async () => {
      const draft = loadVendorOnboardingDraft();
      if (draft?.docs) {
        if (draft.docs.idUrl) setIdUrl(draft.docs.idUrl);
        if (draft.docs.licenseUrl) setLicenseUrl(draft.docs.licenseUrl);
        if (draft.docs.notes) setNotes(draft.docs.notes);
      }
      try {
        const res = await fetch(`${API_BASE}/vendors/onboarding`, {
          credentials: "include",
          headers: getVendorAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.vendor) {
            if (data.vendor.notes) setNotes(data.vendor.notes || "");

            // documents may be array (current) or object (legacy)
            if (data.vendor.documents) {
              const docs = data.vendor.documents;

              if (Array.isArray(docs)) {
                const idDoc = docs.find((d: any) => d.id === 'govt_id' || d.type === 'ID');
                const licenseDoc = docs.find((d: any) => d.id === 'license' || d.type === 'LICENSE');
                if (idDoc?.url) setIdUrl(idDoc.url);
                if (licenseDoc?.url) setLicenseUrl(licenseDoc.url);
              } else if (typeof docs === 'object') {
                if (docs.idDocument) setIdUrl(docs.idDocument);
                if (docs.licenseDocument) setLicenseUrl(docs.licenseDocument);
              }
            }
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

  async function uploadFile(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    
    try {
      const res = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      
      if (!res.ok) {
        let errorMessage = 'Upload failed';

        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // non-JSON body — map common status codes
          if (res.status === 413) {
            errorMessage = 'File too large! Maximum file size is 2MB.';
          } else if (res.status === 400) {
            errorMessage = 'Invalid file type! Only PDF, DOC, DOCX files are allowed.';
          } else if (res.status === 500) {
            errorMessage = 'Server error. Please try again later.';
          } else {
            errorMessage = `Upload failed (Error ${res.status})`;
          }
        }

        throw new Error(errorMessage);
      }

      const data = await res.json();
      return data.url as string;
    } catch (error: any) {
      throw new Error(error.message || 'Upload failed. Please check your file and try again.');
    }
  }

  function validateFile(file: File): { valid: boolean; error?: string } {
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    const ALLOWED_TYPES = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    
    if (file.size > MAX_SIZE) {
      return {
        valid: false,
        error: `File too large! Max 2MB allowed. Your file: ${(file.size / (1024 * 1024)).toFixed(2)}MB`
      };
    }
    
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type! Only PDF, DOC, DOCX allowed.`
      };
    }
    
    return { valid: true };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setToastMessage(null);
    
    try {
      // upload new picks if we don't already have URLs
      let idUrlFinal = idUrl;
      let licenseUrlFinal = licenseUrl;
      
      if (!idUrlFinal && idFile) {
        idUrlFinal = await uploadFile(idFile);
        setIdUrl(idUrlFinal);
      }
      if (!licenseUrlFinal && licenseFile) {
        licenseUrlFinal = await uploadFile(licenseFile);
        setLicenseUrl(licenseUrlFinal);
      }
      
      const documents = [
        idUrlFinal ? {
          id: 'govt_id', type: 'ID', url: idUrlFinal, verified: false,
          name: idFile?.name, size: idFile?.size, mime: idFile?.type,
        } : null,
        licenseUrlFinal ? {
          id: 'license', type: 'LICENSE', url: licenseUrlFinal, verified: false,
          name: licenseFile?.name, size: licenseFile?.size, mime: licenseFile?.type,
        } : null,
      ].filter(Boolean);
      
      const res = await fetch(`${API_BASE}/vendors/onboarding/docs`, {
        method: 'POST', 
        headers: getVendorAuthHeaders(), 
        credentials: 'include',
        body: JSON.stringify({ documents, notes })
      });
      
      if (!res.ok) throw new Error('Failed to save documents');

      saveVendorOnboardingDraft({
        currentStep: '/vendor/onboarding/google',
        docs: { idUrl: idUrlFinal, licenseUrl: licenseUrlFinal, notes },
      });
      
      router.push('/vendor/onboarding/google');
    } catch (err: any) { 
      setToastMessage(err?.message || 'Failed to save documents. Please try again.');
      setToastType('error');
    } finally { 
      setLoading(false); 
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 
          style={{
            fontFamily: 'Raleway',
            fontWeight: 600,
            fontSize: '32px',
            lineHeight: '100%',
            letterSpacing: '0px',
            color: '#0B1A33',
            marginBottom: '16px'
          }}
        >
          Verification Documents
        </h2>
        <p 
          style={{
            fontFamily: 'Inter',
            fontWeight: 300,
            fontSize: '16px',
            lineHeight: '100%',
            letterSpacing: '0px',
            color: '#616161'
          }}
        >
          Upload your identification and business license for verification. Your documents ensure a trusted and secure marketplace for everyone.
        </p>
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Upload your documents (PDF, DOC, DOCX)</p>
              <p>We securely store your files. Max 2MB each. Accepted: pdf, doc, docx.</p>
            </div>
          </div>
        </div>
        
        <label className="block">
          <span 
            className="mb-2 block"
            style={{
              fontFamily: 'Roboto',
              fontWeight: 400,
              fontSize: '16px',
              lineHeight: '100%',
              letterSpacing: '1%',
              color: '#0C1421'
            }}
          >
            Government ID (PDF/DOC/DOCX)
          </span>
          <div
            className="w-full"
            style={{
              height: '48px',
              borderRadius: '50px',
              opacity: 1,
              borderWidth: '1px',
              backgroundColor: '#F7FBFF',
              border: '1px solid #D4D7E3',
              paddingLeft: '12px',
              paddingRight: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                if (f) {
                  const validation = validateFile(f);
                  if (!validation.valid) {
                    setToastMessage(validation.error || 'Invalid file');
                    setToastType('error');
                    e.target.value = '';
                    return;
                  }
                  setIdFile(f);
                  setIdUrl("");
                } else {
                  setIdFile(null);
                }
              }}
            />
            {idFile && (
              <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#0C1421' }}>{idFile.name}</span>
            )}
          </div>
          {idUrl && (
            <div className="mt-2 text-sm" style={{ color: '#0C1421' }}>
              Uploaded: <a href={idUrl} target="_blank" rel="noreferrer" className="underline">View</a>
            </div>
          )}
        </label>

        <label className="block">
          <span 
            className="mb-2 block"
            style={{
              fontFamily: 'Roboto',
              fontWeight: 400,
              fontSize: '16px',
              lineHeight: '100%',
              letterSpacing: '1%',
              color: '#0C1421'
            }}
          >
            Business License (PDF/DOC/DOCX)
          </span>
          <div
            className="w-full"
            style={{
              height: '48px',
              borderRadius: '50px',
              opacity: 1,
              borderWidth: '1px',
              backgroundColor: '#F7FBFF',
              border: '1px solid #D4D7E3',
              paddingLeft: '12px',
              paddingRight: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                if (f) {
                  const validation = validateFile(f);
                  if (!validation.valid) {
                    setToastMessage(validation.error || 'Invalid file');
                    setToastType('error');
                    e.target.value = '';
                    return;
                  }
                  setLicenseFile(f);
                  setLicenseUrl("");
                } else {
                  setLicenseFile(null);
                }
              }}
            />
            {licenseFile && (
              <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#0C1421' }}>{licenseFile.name}</span>
            )}
          </div>
          {licenseUrl && (
            <div className="mt-2 text-sm" style={{ color: '#0C1421' }}>
              Uploaded: <a href={licenseUrl} target="_blank" rel="noreferrer" className="underline">View</a>
            </div>
          )}
        </label>

        <label className="block">
          <span 
            className="mb-2 block"
            style={{
              fontFamily: 'Roboto',
              fontWeight: 400,
              fontSize: '16px',
              lineHeight: '100%',
              letterSpacing: '1%',
              color: '#0C1421'
            }}
          >
            Verification Notes (Optional)
          </span>
          <input 
            className="w-full outline-none" 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional notes for verification..."
            style={{
              height: '48px',
              borderRadius: '50px',
              opacity: 1,
              borderWidth: '1px',
              backgroundColor: '#F7FBFF',
              border: '1px solid #D4D7E3',
              paddingLeft: '20px',
              paddingRight: '20px',
              fontFamily: 'Roboto',
              fontWeight: 400,
              fontSize: '16px',
              lineHeight: '100%',
              letterSpacing: '1%',
              color: '#0C1421'
            }}
          />
        </label>

        <div className="flex justify-between pt-4">
          <button 
            type="button"
            onClick={() => router.push('/vendor/onboarding/business')}
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
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Next</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 8H15M15 8L8 1M15 8L8 15" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </form>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  );
}