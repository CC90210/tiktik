'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── CDN config ───────────────────────────────────────────────────────────────
const FACEAPI_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js'
const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'

// Cached reference so we only inject the script tag once per page session
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceapiLib: any = null

async function loadFaceApi(): Promise<typeof faceapiLib> {
  if (faceapiLib) return faceapiLib
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = FACEAPI_CDN
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      faceapiLib = (window as any).faceapi
      resolve(faceapiLib)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  teacher: { id: string; name: string; color: string }
  centerId: string
  onComplete: () => void
  onClose: () => void
}

type EnrollPhase = 'loading' | 'capturing' | 'submitting' | 'success' | 'error'
type FaceState = 'scanning' | 'detected' | 'holding' | 'captured'

const POSES = [
  { label: 'Look straight at the camera', icon: '👁️', hint: 'Face the lens directly' },
  { label: 'Turn slightly left',           icon: '↖️', hint: 'Just a gentle tilt' },
  { label: 'Turn slightly right',          icon: '↗️', hint: 'Just a gentle tilt' },
] as const

const ACCENT = '#00B894'

// ─── Component ────────────────────────────────────────────────────────────────

export default function FaceEnrollModal({ teacher, onComplete, onClose }: Props) {
  const videoRef        = useRef<HTMLVideoElement>(null)
  const canvasRef       = useRef<HTMLCanvasElement>(null)    // hidden capture canvas
  const overlayRef      = useRef<HTMLCanvasElement>(null)    // detection overlay
  const streamRef       = useRef<MediaStream | null>(null)
  const holdTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef          = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  const capturedRef     = useRef<boolean>(false)             // prevents double-capture in rAF

  const [phase,       setPhase]       = useState<EnrollPhase>('loading')
  const [modelsReady, setModelsReady] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [step,        setStep]        = useState(0)           // 0 | 1 | 2
  const [faceState,   setFaceState]   = useState<FaceState>('scanning')
  const [descriptors, setDescriptors] = useState<number[][]>([])
  const [thumbs,      setThumbs]      = useState<string[]>([])
  const [errorMsg,    setErrorMsg]    = useState<string>('')

  // ─── Load face-api models (tinyFaceDetector + landmarks + recognition) ─────
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const api = await loadFaceApi()
        await Promise.all([
          api.nets.tinyFaceDetector.loadFromUri(MODEL_CDN),
          api.nets.faceLandmark68Net.loadFromUri(MODEL_CDN),
          api.nets.faceRecognitionNet.loadFromUri(MODEL_CDN),
        ])
        if (!cancelled) {
          setModelsReady(true)
          setPhase('capturing')
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Failed to load face recognition models. Check your connection.')
          setPhase('error')
        }
      }
    }

    bootstrap()
    return () => { cancelled = true }
  }, [])

  // ─── Camera ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
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

  // ─── ESC to close (only while not submitting/success) ────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'submitting' && phase !== 'success') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [phase, onClose])

  // ─── Capture thumbnail from current video frame ───────────────────────────
  const captureThumbnail = useCallback((): string => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return ''
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    // Mirror to match the CSS-mirrored video display
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.75)
  }, [])

  // ─── Advance to next step or trigger submission ───────────────────────────
  const advanceStep = useCallback((newDescriptor: number[], thumb: string) => {
    setDescriptors(prev => {
      const next = [...prev, newDescriptor]

      setThumbs(t => [...t, thumb])
      setFaceState('captured')

      const nextStep = next.length  // 1-indexed step we're about to show

      if (nextStep >= POSES.length) {
        // All 3 done — submit
        setPhase('submitting')

        fetch('/api/teachers/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacher.id, descriptors: next }),
        })
          .then(async res => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
            }
            setPhase('success')
            setTimeout(onComplete, 2200)
          })
          .catch(err => {
            setErrorMsg(err instanceof Error ? err.message : 'Enrolment failed.')
            setPhase('error')
          })
      } else {
        // Move to next pose after a short celebration pause
        setTimeout(() => {
          setStep(nextStep)
          setFaceState('scanning')
          capturedRef.current = false
        }, 900)
      }

      return next
    })
  }, [teacher.id, onComplete])

  // ─── Detection loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!modelsReady || cameraError || phase !== 'capturing') return

    let frameId: ReturnType<typeof requestAnimationFrame>

    const runDetection = async () => {
      const video   = videoRef.current
      const overlay = overlayRef.current

      if (video && overlay && video.readyState >= 2 && video.videoWidth > 0) {
        const dw = video.offsetWidth
        const dh = video.offsetHeight
        overlay.width  = dw
        overlay.height = dh

        const ctx = overlay.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, dw, dh)

          // Draw dashed guide oval (always visible)
          drawGuideOval(ctx, dw, dh, false)

          if (!capturedRef.current) {
            const detection = await faceapiLib
              .detectSingleFace(
                video,
                new faceapiLib.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
              )
              .withFaceLandmarks()
              .withFaceDescriptor()

            if (detection) {
              // Re-draw oval in active colour
              ctx.clearRect(0, 0, dw, dh)
              drawGuideOval(ctx, dw, dh, true)

              setFaceState(prev => {
                if (prev === 'scanning') {
                  // Start 1-second hold timer
                  holdTimerRef.current = setTimeout(() => {
                    if (capturedRef.current) return
                    capturedRef.current = true
                    setFaceState('holding')

                    const descriptor = Array.from(detection.descriptor) as number[]
                    const thumb = captureThumbnail()
                    advanceStep(descriptor, thumb)
                  }, 1000)
                  return 'detected'
                }
                return prev
              })
            } else {
              // Face lost — cancel hold timer
              setFaceState(prev => {
                if (prev === 'detected') {
                  if (holdTimerRef.current) {
                    clearTimeout(holdTimerRef.current)
                    holdTimerRef.current = null
                  }
                  return 'scanning'
                }
                return prev
              })
            }
          }
        }
      }

      frameId = requestAnimationFrame(runDetection)
    }

    frameId = requestAnimationFrame(runDetection)
    rafRef.current = frameId

    return () => {
      cancelAnimationFrame(frameId)
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsReady, cameraError, phase, step])

  // step changes reset capturedRef so the loop can pick up the new pose
  useEffect(() => {
    capturedRef.current = false
  }, [step])

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current)     cancelAnimationFrame(rafRef.current)
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    }
  }, [])

  // ─── Status label ─────────────────────────────────────────────────────────
  const statusLabel = (() => {
    if (cameraError) return null
    switch (faceState) {
      case 'scanning':  return 'Position your face inside the oval'
      case 'detected':  return 'Face detected — hold still...'
      case 'holding':   return 'Capturing...'
      case 'captured':  return 'Got it!'
    }
  })()

  const faceActive = faceState === 'detected' || faceState === 'holding'

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Hidden capture canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── SUCCESS ──────────────────────────────────────────────────────── */}
      {phase === 'success' && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'radial-gradient(ellipse at center, #00B89422 0%, #000 70%)' }}>
          <div className="flex flex-col items-center text-center px-8 gap-6">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center shadow-2xl confirm-pop"
              style={{ backgroundColor: ACCENT, boxShadow: `0 0 70px ${ACCENT}88` }}
            >
              <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor"
                viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"
                  style={{ strokeDasharray: 30, animation: 'draw-check 0.4s ease 0.15s forwards', strokeDashoffset: 30 }} />
              </svg>
            </div>

            <div className="confirm-slide-up">
              <h2 className="text-white text-4xl font-bold mb-2">Face Enrolled!</h2>
              <p className="text-white/70 text-xl">
                {teacher.name} can now clock in with facial recognition.
              </p>
            </div>

            {/* Thumbnails row */}
            <div className="flex gap-3 confirm-slide-up-delay">
              {thumbs.map((t, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={t}
                  alt={`Pose ${i + 1}`}
                  className="w-16 h-16 rounded-xl object-cover"
                  style={{ outline: `2px solid ${ACCENT}`, outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR ────────────────────────────────────────────────────────── */}
      {phase === 'error' && (
        <div className="relative z-10 bg-black/80 backdrop-blur-md text-white p-8 rounded-3xl
          text-center max-w-sm mx-4 border border-white/10 flex flex-col items-center gap-5">
          <div className="text-5xl">⚠️</div>
          <div>
            <p className="text-xl font-bold mb-2">Enrolment Failed</p>
            <p className="text-white/60 text-sm">{errorMsg}</p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => {
                setPhase('capturing')
                setStep(0)
                setDescriptors([])
                setThumbs([])
                setFaceState('scanning')
                capturedRef.current = false
              }}
              className="px-8 py-3 rounded-full font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: ACCENT }}
            >
              Try Again
            </button>
            <button
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 px-8 py-3 rounded-full
                font-semibold text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── SUBMITTING ───────────────────────────────────────────────────── */}
      {phase === 'submitting' && (
        <div className="flex flex-col items-center gap-5 text-white">
          <div
            className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: `${ACCENT} transparent transparent transparent` }}
          />
          <p className="text-xl font-semibold">Saving face data…</p>
        </div>
      )}

      {/* ── LOADING (models) ─────────────────────────────────────────────── */}
      {phase === 'loading' && (
        <div className="flex flex-col items-center gap-5 text-white">
          <div
            className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: `${ACCENT} transparent transparent transparent` }}
          />
          <p className="text-white/70">Loading face recognition…</p>
        </div>
      )}

      {/* ── CAPTURING ────────────────────────────────────────────────────── */}
      {(phase === 'capturing') && (
        <>
          {/* Live video — mirrored */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Detection overlay canvas */}
          {!cameraError && (
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 2 }}
            />
          )}

          {/* Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 3,
              background: 'radial-gradient(ellipse at center, transparent 36%, rgba(0,0,0,0.65) 100%)',
            }}
          />

          {/* Pulsing glow ring when face locked */}
          {faceActive && (
            <div
              className="absolute inset-0 pointer-events-none face-glow-ring"
              style={{ zIndex: 4, boxShadow: `inset 0 0 60px 20px ${ACCENT}44` }}
            />
          )}

          {/* ── TOP HEADER ─────────────────────────────────────────────── */}
          <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-8 pb-3 gap-2"
            style={{ zIndex: 10 }}>
            {/* Teacher chip */}
            <div
              className="px-6 py-2 rounded-2xl text-white text-lg font-bold shadow-xl backdrop-blur-sm"
              style={{ backgroundColor: `${teacher.color}CC` }}
            >
              {teacher.name} — Face Enrolment
            </div>

            {/* Step progress pills */}
            <div className="flex items-center gap-2 mt-1">
              {POSES.map((_, i) => {
                const done    = i < descriptors.length
                const active  = i === step && phase === 'capturing'
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
                      transition-all duration-400 border-2"
                    style={{
                      backgroundColor: done
                        ? ACCENT
                        : active
                          ? 'rgba(0,184,148,0.25)'
                          : 'rgba(255,255,255,0.08)',
                      borderColor: done || active ? ACCENT : 'rgba(255,255,255,0.2)',
                      color: done || active ? '#fff' : 'rgba(255,255,255,0.5)',
                      boxShadow: active ? `0 0 12px ${ACCENT}88` : 'none',
                    }}
                  >
                    {done ? '✓' : i + 1}
                  </div>
                )
              })}
              <span className="text-white/50 text-sm ml-1">
                Step {Math.min(step + 1, POSES.length)} of {POSES.length}
              </span>
            </div>
          </div>

          {/* ── POSE INSTRUCTION CARD ──────────────────────────────────── */}
          {!cameraError && (
            <div
              className="absolute pointer-events-none flex flex-col items-center gap-1 pose-card"
              style={{ zIndex: 10, top: '62%', left: 0, right: 0 }}
            >
              <div
                className="px-7 py-4 rounded-2xl text-center backdrop-blur-md shadow-xl transition-all duration-300 mx-6"
                style={{
                  backgroundColor: faceActive
                    ? `${ACCENT}22`
                    : 'rgba(0,0,0,0.60)',
                  border: `1.5px solid ${faceActive ? ACCENT : 'rgba(255,255,255,0.15)'}`,
                }}
              >
                <p className="text-3xl mb-1">{POSES[step].icon}</p>
                <p className="text-white text-xl font-semibold leading-tight">
                  {POSES[step].label}
                </p>
                <p className="text-white/50 text-sm mt-0.5">{POSES[step].hint}</p>
              </div>

              {/* Status badge */}
              {statusLabel && (
                <div
                  className="px-5 py-2 rounded-full text-sm font-semibold mt-2 backdrop-blur-sm transition-all duration-300"
                  style={{
                    backgroundColor: faceActive
                      ? `${ACCENT}CC`
                      : 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    border: faceActive
                      ? `1px solid ${ACCENT}`
                      : '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  {statusLabel}
                </div>
              )}
            </div>
          )}

          {/* ── CAPTURED THUMBNAILS STRIP ──────────────────────────────── */}
          {thumbs.length > 0 && (
            <div
              className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 px-6"
              style={{ zIndex: 10 }}
            >
              {thumbs.map((t, i) => (
                <div key={i} className="relative thumb-pop">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t}
                    alt={`Pose ${i + 1}`}
                    className="w-14 h-14 rounded-xl object-cover shadow-lg"
                    style={{ border: `2px solid ${ACCENT}` }}
                  />
                  <div
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    ✓
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CAMERA ERROR ───────────────────────────────────────────── */}
          {cameraError && (
            <div className="relative z-10 bg-black/70 backdrop-blur-md text-white p-8 rounded-3xl
              text-center max-w-sm mx-4 border border-white/10">
              <div className="text-5xl mb-4">📷</div>
              <p className="text-xl font-bold mb-2">Camera Access Required</p>
              <p className="text-white/70 mb-6 text-sm">
                Enable camera permissions in your device settings to enrol a face.
              </p>
              <button
                onClick={onClose}
                className="bg-white text-[#2D3436] px-8 py-3 rounded-full font-semibold
                  text-lg hover:bg-white/90 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── CLOSE BUTTON ───────────────────────────────────────────── */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm text-white
              w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium
              hover:bg-black/70 transition-colors border border-white/20"
            style={{ zIndex: 20 }}
            aria-label="Close enrolment"
          >
            ✕
          </button>
        </>
      )}

      {/* ─── Global keyframe animations ─────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes draw-check {
          from { stroke-dashoffset: 30; }
          to   { stroke-dashoffset: 0;  }
        }

        @keyframes confirm-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          65%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        .confirm-pop {
          animation: confirm-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes slide-up-fade {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .confirm-slide-up {
          animation: slide-up-fade 0.4s ease 0.3s both;
        }
        .confirm-slide-up-delay {
          animation: slide-up-fade 0.4s ease 0.5s both;
        }

        @keyframes face-glow-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1;   }
        }
        .face-glow-ring {
          animation: face-glow-pulse 1.2s ease-in-out infinite;
        }

        @keyframes thumb-pop-in {
          0%   { transform: scale(0.6) rotate(-6deg); opacity: 0; }
          70%  { transform: scale(1.1) rotate(2deg);  opacity: 1; }
          100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
        }
        .thumb-pop {
          animation: thumb-pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes pose-slide-in {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .pose-card {
          animation: pose-slide-in 0.35s ease both;
        }
      `}</style>
    </div>
  )
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function drawGuideOval(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  active: boolean
) {
  const cx = w / 2
  const cy = h / 2 - h * 0.04
  const rx = w * 0.22
  const ry = h * 0.30

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.setLineDash(active ? [] : [10, 8])
  ctx.lineWidth   = active ? 3 : 2
  ctx.strokeStyle = active ? ACCENT : 'rgba(255,255,255,0.50)'
  if (active) {
    ctx.shadowBlur  = 20
    ctx.shadowColor = ACCENT
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}
