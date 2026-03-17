'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { TeacherStatus } from '@/lib/types'
import { formatTime } from '@/lib/utils'

interface Props {
  teacher: TeacherStatus
  onCapture: (photoBase64: string) => void
  onClose: () => void
}

export default function CameraModal({ teacher, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [countdown, setCountdown] = useState<number | null>(3)
  const [captured, setCaptured] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const action = teacher.is_clocked_in ? 'out' : 'in'

  // Start camera
  useEffect(() => {
    let mounted = true

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        if (mounted) setCameraError(true)
      }
    }

    startCamera()

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Countdown tick
  useEffect(() => {
    if (countdown === null || countdown <= 0 || cameraError) return
    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null))
    }, 1000)
    return () => clearTimeout(timer)
  }, [countdown, cameraError])

  // Capture when countdown reaches 0
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mirror front camera so photo matches what user sees
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    setCapturedPhoto(dataUrl)
    setCaptured(true)
    streamRef.current?.getTracks().forEach(t => t.stop())
    onCapture(dataUrl)
    // Auto-close after 2 seconds
    setTimeout(onClose, 2000)
  }, [onCapture, onClose])

  useEffect(() => {
    if (countdown === 0 && !captured) {
      capturePhoto()
    }
  }, [countdown, captured, capturePhoto])

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !captured) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, captured])

  const accentColor = action === 'in' ? '#00B894' : '#FF6B6B'
  const actionLabel = action === 'in' ? 'Clocking In' : 'Clocking Out'
  const confirmLabel = action === 'in' ? 'Clocked In!' : 'Clocked Out!'

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {!captured ? (
        <>
          {/* Live camera feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Dark vignette overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)',
            }}
          />

          {/* Top banner: teacher name + action */}
          <div className="absolute top-0 left-0 right-0 flex justify-center pt-8 pb-4">
            <div
              className="px-8 py-3 rounded-2xl text-white text-2xl font-bold shadow-xl backdrop-blur-sm"
              style={{ backgroundColor: `${teacher.color}CC` }}
            >
              {teacher.name} &mdash; {actionLabel}
            </div>
          </div>

          {/* Centered countdown */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {countdown !== null && countdown > 0 && !cameraError && (
              <>
                <p className="text-white text-3xl font-semibold mb-6 drop-shadow-lg tracking-wide">
                  Smile! 📸
                </p>
                <CountdownNumber key={countdown} value={countdown} />
              </>
            )}

            {cameraError && (
              <div className="bg-black/70 backdrop-blur-md text-white p-8 rounded-3xl text-center max-w-sm mx-4 border border-white/10">
                <div className="text-5xl mb-4">📷</div>
                <p className="text-xl font-bold mb-2">Camera Access Required</p>
                <p className="text-white/70 mb-6">
                  Enable camera permissions in your device settings to clock in.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      // Clock in without photo for demo/fallback
                      onCapture('')
                      setCaptured(true)
                      setTimeout(onClose, 2000)
                    }}
                    className="px-8 py-3 rounded-full font-semibold text-lg transition-colors text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {action === 'in' ? 'Clock In' : 'Clock Out'} Without Photo
                  </button>
                  <button
                    onClick={onClose}
                    className="bg-white text-[#2D3436] px-8 py-3 rounded-full font-semibold text-lg hover:bg-white/90 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Frame guide corners */}
          {!cameraError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-64 h-64">
                {/* Top-left */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg opacity-70" />
                {/* Top-right */}
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg opacity-70" />
                {/* Bottom-left */}
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg opacity-70" />
                {/* Bottom-right */}
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg opacity-70" />
              </div>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm text-white w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium hover:bg-black/70 transition-colors border border-white/20"
            aria-label="Close"
          >
            ✕
          </button>
        </>
      ) : (
        /* Confirmation screen */
        <div className="absolute inset-0 flex items-center justify-center">
          {capturedPhoto && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 camera capture, not a content image
            <img
              src={capturedPhoto}
              alt="Captured"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.35) blur(2px)' }}
            />
          )}
          <div className="relative z-10 flex flex-col items-center text-center px-8">
            {/* Checkmark circle */}
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center mb-6 shadow-2xl"
              style={{
                backgroundColor: accentColor,
                boxShadow: `0 0 60px ${accentColor}88`,
              }}
            >
              <svg
                className="w-14 h-14 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                  style={{ strokeDasharray: 30, animation: 'draw-check 0.4s ease forwards' }}
                />
              </svg>
            </div>

            <h2 className="text-white text-5xl font-bold mb-3 drop-shadow-lg">
              {confirmLabel}
            </h2>
            <p className="text-white/70 text-2xl font-medium drop-shadow">
              {teacher.name}
            </p>
            <p className="text-white/50 text-xl mt-2">
              {formatTime(new Date())}
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes countdown-pop {
          0% {
            transform: scale(1.6);
            opacity: 0;
          }
          30% {
            transform: scale(0.95);
            opacity: 1;
          }
          80% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(0.85);
            opacity: 0;
          }
        }

        .countdown-digit {
          animation: countdown-pop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes draw-check {
          from { stroke-dashoffset: 30; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}

// Separate component so key-based re-mount triggers animation cleanly
function CountdownNumber({ value }: { value: number }) {
  return (
    <div className="countdown-digit text-white font-bold drop-shadow-2xl select-none"
      style={{ fontSize: '10rem', lineHeight: 1 }}
    >
      {value}
    </div>
  )
}
