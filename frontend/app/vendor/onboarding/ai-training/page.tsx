"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getVendorAuthHeaders } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";
import { saveVendorOnboardingDraft } from "@/lib/vendor-onboarding-draft";

const API_BASE = resolveApiBaseUrl();

interface Question {
  questionId: string;
  text: string;
  type: 'multiple_choice' | 'text' | 'multi_select';
  options?: string[];
}

type Screen = 'welcome' | 'question' | 'processing' | 'profile-preview';

interface QuestionHistory {
  question: Question;
  answer: string | string[];
  questionNumber: number;
}

interface ForwardPath {
  question: Question;
  questionNumber: number;
}

export default function AITrainingStep() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<string | string[] | ''>('');
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [completed, setCompleted] = useState(false);
  // history for Back; forwardPath restores questions after going back
  const [questionHistory, setQuestionHistory] = useState<QuestionHistory[]>([]);
  const [forwardPath, setForwardPath] = useState<ForwardPath[]>([]);

  async function handleStart() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vendors/onboarding/ai/start`, {
        method: 'POST',
        headers: getVendorAuthHeaders(),
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to start onboarding');

      const data = await res.json();
      setSessionId(data.sessionId);
      setCurrentQuestion(data.currentQuestion);
      setTotalQuestions(data.estimatedTotal || data.questions.length || 12);
      setQuestionHistory([]);
      setForwardPath([]);
      setScreen('question');
    } catch (error) {
      console.error('Error starting onboarding:', error);
      alert('Failed to start AI onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    saveVendorOnboardingDraft({ currentStep: '/vendor/onboarding/review' });
    router.push('/vendor/onboarding/review');
  }

  async function handleSubmitAnswer() {
    if (!sessionId || !currentQuestion) return;

    if (currentQuestion.type === 'multi_select' && (!Array.isArray(currentAnswer) || currentAnswer.length === 0)) {
      alert('Please select at least one option');
      return;
    }
    if ((currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'text') && !currentAnswer) {
      alert('Please provide an answer');
      return;
    }

    // revisiting after Back — restore next from forwardPath, don't re-submit
    if (forwardPath.length > 0) {
      const next = forwardPath[0];
      if (currentQuestion) {
        setQuestionHistory(prev => [...prev, {
          question: currentQuestion,
          answer: currentAnswer,
          questionNumber: questionNumber
        }]);
      }
      setForwardPath(prev => prev.slice(1));
      setCurrentQuestion(next.question);
      setQuestionNumber(next.questionNumber);
      setCurrentAnswer('');
      setScreen('question');
      return;
    }

    setLoading(true);
    setScreen('processing');

    try {
      const res = await fetch(`${API_BASE}/vendors/onboarding/ai/answer`, {
        method: 'POST',
        headers: getVendorAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.questionId,
          answer: currentAnswer,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit answer');

      const data = await res.json();

      if (data.tags) {
        setTags(data.tags);
      }

      if (data.estimatedTotal) {
        setTotalQuestions(data.estimatedTotal);
      }

      if (data.completed || !data.nextQuestion) {
        setCompleted(true);
        setProfile(data.profile);
        setScreen('profile-preview');
      } else {
        if (currentQuestion) {
          setQuestionHistory(prev => [...prev, {
            question: currentQuestion,
            answer: currentAnswer,
            questionNumber: questionNumber
          }]);
        }
        setForwardPath([]);
        setCurrentQuestion(data.nextQuestion);
        setQuestionNumber(data.currentQuestionNumber || (prev => prev + 1));
        setCurrentAnswer('');
        setScreen('question');
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      alert('Failed to submit answer. Please try again.');
      setScreen('question');
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!sessionId) {
      saveVendorOnboardingDraft({ currentStep: '/vendor/onboarding/review' });
      router.push('/vendor/onboarding/review');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vendors/onboarding/ai/complete`, {
        method: 'POST',
        headers: getVendorAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) throw new Error('Failed to complete onboarding');

      saveVendorOnboardingDraft({ currentStep: '/vendor/onboarding/review' });
      router.push('/vendor/onboarding/review');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      // still send them to review on failure
      saveVendorOnboardingDraft({ currentStep: '/vendor/onboarding/review' });
      router.push('/vendor/onboarding/review');
    } finally {
      setLoading(false);
    }
  }

  function handleAnswerSelect(value: string) {
    if (currentQuestion?.type === 'multi_select') {
      const current = Array.isArray(currentAnswer) ? currentAnswer : [];
      if (current.includes(value)) {
        setCurrentAnswer(current.filter(v => v !== value));
      } else {
        setCurrentAnswer([...current, value]);
      }
    } else {
      setCurrentAnswer(value);
    }
  }

  function handleBack() {
    if (questionHistory.length > 0) {
      const previousQuestion = questionHistory[questionHistory.length - 1];

      // stash current so Forward can restore it
      if (currentQuestion) {
        setForwardPath(prev => [{
          question: currentQuestion,
          questionNumber: questionNumber
        }, ...prev]);
      }

      setQuestionHistory(prev => prev.slice(0, -1));
      setCurrentQuestion(previousQuestion.question);
      setCurrentAnswer(previousQuestion.answer);
      setQuestionNumber(previousQuestion.questionNumber);
      setScreen('question');
    } else {
      router.push('/vendor/onboarding/identity');
    }
  }

  if (screen === 'welcome') {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-3 shadow-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1.5">AI-Powered Profile Builder</h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Let's learn about your business to provide personalized recommendations
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Takes 3-5 minutes</p>
                <p className="text-xs text-gray-600">Quick questions to understand your business</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Questions adapt to your answers</p>
                <p className="text-xs text-gray-600">AI tailors follow-up questions based on your responses</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Helps match you with ideal events</p>
                <p className="text-xs text-gray-600">Better recommendations for your business</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 px-5 py-2.5 bg-white border border-gray-300 hover:border-gray-400 rounded-lg text-sm font-semibold text-gray-700 transition-all hover:shadow-sm"
          >
            Skip for Now
          </button>
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex-1 px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-md rounded-lg text-sm font-semibold text-white"
            style={{
              backgroundColor: '#2563eb',
            }}
          >
            {loading ? 'Starting...' : 'Start AI Onboarding'}
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] space-y-5">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-1.5">Analyzing your response...</h3>
          <p className="text-sm text-gray-600">We're learning about your business preferences</p>
        </div>
      </div>
    );
  }

  if (screen === 'profile-preview' && profile) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-green-100 mb-3 shadow-sm">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1.5">✨ Your AI-Generated Profile</h2>
          <p className="text-sm text-gray-600">Review your personalized profile below</p>
        </div>

        <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Vendor Persona</h3>
            <p className="text-base font-semibold text-blue-600">{profile.persona || 'Event Service Provider'}</p>
          </div>

          {tags.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md font-medium text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.insights && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Insights</h3>
              <div className="space-y-1 text-xs text-gray-700">
                {profile.insights.preferredEventSize && (
                  <p>• Preferred Event Size: {profile.insights.preferredEventSize}</p>
                )}
                {profile.insights.peakSeasons && (
                  <p>• Peak Seasons: {Array.isArray(profile.insights.peakSeasons) ? profile.insights.peakSeasons.join(', ') : profile.insights.peakSeasons}</p>
                )}
                {profile.insights.experienceLevel && (
                  <p>• Experience Level: {profile.insights.experienceLevel}</p>
                )}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-200">
            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-md rounded-lg text-sm font-semibold text-white"
              style={{
                backgroundColor: '#2563eb',
              }}
            >
              {loading ? 'Saving...' : 'Continue to Review'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return <div>Loading question...</div>;
  }

  const progress = (questionNumber / totalQuestions) * 100;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-700">
            Question {questionNumber} of {totalQuestions}
          </span>
          <span className="text-xs font-bold text-blue-600">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            {questionNumber}
          </div>
          <h3 className="text-lg font-bold text-gray-900">{currentQuestion.text}</h3>
        </div>

        {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
          <div className="grid grid-cols-2 gap-2.5">
            {currentQuestion.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleAnswerSelect(option)}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  currentAnswer === option
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {currentQuestion.type === 'multi_select' && currentQuestion.options && (
          <div className="grid grid-cols-2 gap-2.5">
            {currentQuestion.options.map((option) => {
              const selected = Array.isArray(currentAnswer) && currentAnswer.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleAnswerSelect(option)}
                  className={`relative px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    selected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {selected && (
                    <svg className="absolute top-1.5 right-1.5 w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {currentQuestion.type === 'text' && (
          <textarea
            value={typeof currentAnswer === 'string' ? currentAnswer : ''}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none text-sm"
            rows={4}
          />
        )}
      </div>

      <div className="flex justify-between pt-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 hover:border-gray-400 rounded-lg text-sm font-semibold text-gray-700 transition-all hover:shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M15 8H1M1 8L8 15M1 8L8 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Back</span>
        </button>
        <button
          onClick={handleSubmitAnswer}
          disabled={loading || !currentAnswer || (Array.isArray(currentAnswer) && currentAnswer.length === 0)}
          className="flex items-center gap-2 px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-md disabled:hover:shadow-none rounded-lg text-sm font-semibold text-white"
          style={{
            backgroundColor: '#2563eb',
          }}
        >
          {loading ? 'Processing...' : 'Next'}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M1 8H15M15 8L8 1M15 8L8 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
