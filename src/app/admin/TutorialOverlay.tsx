'use client'

import { useState } from 'react'

interface Props {
  onComplete: () => void
  centerSlug: string
}

const steps = [
  {
    target: 'add-teacher',
    title: 'Start here!',
    description: 'Add your teachers. Just type their name and hit Add.',
    position: 'below' as const,
  },
  {
    target: 'teachers',
    title: 'Your Team',
    description: "Your teachers show up here. They'll also appear on the iPad clock-in screen.",
    position: 'above' as const,
  },
  {
    target: 'today-log',
    title: "Today's Log",
    description: 'Every time someone clocks in or out, it shows up here with their photo and timestamp.',
    position: 'below' as const,
  },
  {
    target: 'export',
    title: 'Export Hours',
    description: 'Export hours anytime — CSV for spreadsheets, PDF for records, or copy to clipboard.',
    position: 'below' as const,
  },
]

export default function TutorialOverlay({ onComplete, centerSlug }: Props) {
  const [step, setStep] = useState(0)

  const isLastStep = step >= steps.length

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
        {!isLastStep ? (
          <>
            <div className="text-xs text-[#B2BEC3] mb-2">{step + 1} / {steps.length + 1}</div>
            <h2 className="text-xl font-bold text-[#2D3436] mb-2">{steps[step].title}</h2>
            <p className="text-[#636E72] mb-6">{steps[step].description}</p>
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-8 py-3 bg-[#00B894] text-white rounded-xl font-medium hover:bg-[#00A884] transition-colors"
            >
              Next
            </button>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-xl font-bold text-[#2D3436] mb-2">You&apos;re all set!</h2>
            <p className="text-[#636E72] mb-2">
              Open the clock-in screen on your iPad:
            </p>
            <code className="block bg-[#F1F2F6] px-4 py-2 rounded-lg text-sm mb-6 text-[#2D3436]">
              /c/{centerSlug}/clockin
            </code>
            <button
              onClick={onComplete}
              className="px-8 py-3 bg-[#00B894] text-white rounded-xl font-medium hover:bg-[#00A884] transition-colors"
            >
              Got it!
            </button>
          </>
        )}
      </div>
    </div>
  )
}
