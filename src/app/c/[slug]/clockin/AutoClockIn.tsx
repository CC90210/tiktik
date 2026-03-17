'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { formatTime } from '@/lib/utils'

// ─── CDN constants (must match CameraModal.tsx — single source of truth) ──────
const FACEAPI_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js'
const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'

// Module-level singleton: reuse the library instance loaded by CameraModal (or
// load it fresh if AutoClockIn is mounted first).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceapiLib: any = null

async function loadFaceApi(): Promise<typeof faceapiLib> {
  // Reuse if already loaded (either by this module or by CameraModal)
  if (faceapiLib) return faceapiLib
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).faceapi) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faceapiLib = (window as any).faceapi
    return faceapiLib
  }
  return new Promise((resolve, reject) => {
    // Check if the script tag was already added by CameraModal
    if (document.querySelector(`script[src="${FACEAPI_CDN}"]`)) {
      const poll = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).faceapi) {
          clearInterval(poll)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          faceapiLib = (window as any).faceapi
          resolve(faceapiLib)
        }
      }, 100)
      return
    }
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

interface EnrolledTeacher {
  id: string
  name: string
  color: string
  face_descriptors: number[][]
}

type AutoState =
  | 'loading'     // models loading / camera starting
  | 'scanning'    // watching for faces
  | 'recognized'  // teacher matched — brief 1s preview before countdown
  | 'countdown'   // 3-2-1 before clock event fires
  | 'clocking'    // POSTing the clock event
  | 'confirmed'   // success — show result for 3s
  | 'error'       // unrecoverable (camera denied, etc.)

interface Props {
  centerId: string
  onClockEvent: (teacherId: string, photoBase64: string) => Promise<void>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoClockIn({ centerId, onClockEvent }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameIdRef = useRef<number | null>(null)
  const recognizedHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [autoState, setAutoState] = useState<AutoState>('loading')
  const [modelsReady, setModelsReady] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [enrolledTeachers, setEnrolledTeachers] = useState<EnrolledTeacher[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [countdown, setCountdown] = useState(3)

  // Currently recognized teacher
  const [recognizedTeacher, setRecognizedTeacher] = useState<EnrolledTeacher | null>(null)
  // 'in' | 'out' — derived from clock status; we fetch it during clocking
  const [clockAction, setClockAction] = useState<'in' | 'out'>('in')

  // Per-teacher cooldown: teacherId → timestamp of last clock
  const cooldownMapRef = useRef<Map<string, number>>(new Map())

  // Stable ref for the active recognized teacher to avoid stale closure in rAF loop
  const recognizedTeacherRef = useRef<EnrolledTeacher | null>(null)
  const autoStateRef = useRef<AutoState>('loading')

  // Keep refs in sync with state
  useEffect(() => { recognizedTeacherRef.current = recognizedTeacher }, [recognizedTeacher])
  useEffect(() => { autoStateRef.current = autoState }, [autoState])

  // ─── Clock tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // ─── Fetch enrolled descriptors ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/teachers/descriptors?center_id=${centerId}`)
      .then(res => res.json())
      .then((data: EnrolledTeacher[]) => {
        if (Array.isArray(data)) setEnrolledTeachers(data)
      })
      .catch(() => {/* will show "no enrolled teachers" in UI */})
  }, [centerId])

  // ─── Load face-api + models ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadModels() {
      try {
        const api = await loadFaceApi()
        await Promise.all([
          api.nets.tinyFaceDetector.loadFromUri(MODEL_CDN),
          api.nets.faceLandmark68Net.loadFromUri(MODEL_CDN),
          api.nets.faceRecognitionNet.loadFromUri(MODEL_CDN),
        ])
        if (!cancelled) setModelsReady(true)
      } catch {
        if (!cancelled) setAutoState('error')
      }
    }

    loadModels()
    return () => { cancelled = true }
  }, [])

  // ─── Start camera ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
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

  // ─── Transition to scanning once both models + camera are ready ─────────────
  useEffect(() => {
    if (modelsReady && !cameraError) {
      setAutoState('scanning')
    }
  }, [modelsReady, cameraError])

  // ─── Capture photo helper ────────────────────────────────────────────────────
  const capturePhoto = useCallback((): string => {
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas) return ''
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, [])

  // ─── Trigger clock event ─────────────────────────────────────────────────────
  const triggerClock = useCallback(async (teacher: EnrolledTeacher) => {
    setAutoState('clocking')

    // Fetch current clock-in status for this teacher
    let action: 'in' | 'out' = 'in'
    try {
      const res = await fetch(`/api/clock-events/status?center_id=${centerId}`)
      const statuses: { id: string; is_clocked_in: boolean }[] = await res.json()
      const status = statuses.find(s => s.id === teacher.id)
      action = status?.is_clocked_in ? 'out' : 'in'
    } catch {
      // Default to 'in' if status fetch fails
    }
    setClockAction(action)

    const photo = capturePhoto()
    try {
      await onClockEvent(teacher.id, photo)
    } catch {
      // Even on error, continue to confirmed to avoid blocking the kiosk
    }

    // Record cooldown timestamp
    cooldownMapRef.current.set(teacher.id, Date.now())

    setAutoState('confirmed')

    // Reset after 3 seconds
    const resetTimer = setTimeout(() => {
      setRecognizedTeacher(null)
      setCountdown(3)
      setAutoState('scanning')
    }, 3000)

    return () => clearTimeout(resetTimer)
  }, [centerId, capturePhoto, onClockEvent])

  // ─── Start countdown ─────────────────────────────────────────────────────────
  const startCountdown = useCallback((teacher: EnrolledTeacher) => {
    if (countdownIntervalRef.current) return
    setAutoState('countdown')
    setCountdown(3)

    let current = 3
    countdownIntervalRef.current = setInterval(() => {
      current -= 1
      setCountdown(current)
      if (current <= 0) {
        clearInterval(countdownIntervalRef.current!)
        countdownIntervalRef.current = null
        triggerClock(teacher)
      }
    }, 1000)
  }, [triggerClock])

  // ─── Build FaceMatcher from enrolled descriptors ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildMatcher = useCallback((): any | null => {
    if (!faceapiLib || enrolledTeachers.length === 0) return null

    const labeled = enrolledTeachers.map(t => {
      const descriptors = t.face_descriptors.map(d => new Float32Array(d))
      return new faceapiLib.LabeledFaceDescriptors(t.id, descriptors)
    })

    return new faceapiLib.FaceMatcher(labeled, 0.6)
  }, [enrolledTeachers])

  // ─── Detection loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoState !== 'scanning' || !modelsReady || cameraError) return

    const faceMatcher = buildMatcher()

    const runDetection = async () => {
      const video = videoRef.current
      const overlay = overlayCanvasRef.current

      if (video && overlay && video.readyState >= 2 && video.videoWidth > 0) {
        const { videoWidth: vw, videoHeight: vh } = video
        const dw = overlay.offsetWidth
        const dh = overlay.offsetHeight
        overlay.width = dw
        overlay.height = dh

        const ctx = overlay.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, dw, dh)

          if (faceMatcher) {
            const detection = await faceapiLib
              .detectSingleFace(video, new faceapiLib.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
              .withFaceLandmarks()
              .withFaceDescriptor()

            if (detection) {
              const { x, y, width, height } = detection.detection.box
              const scaleX = dw / vw
              const scaleY = dh / vh
              const mirroredX = dw - (x + width) * scaleX
              const scaledY = y * scaleY
              const scaledW = width * scaleX
              const scaledH = height * scaleY

              const match = faceMatcher.findBestMatch(detection.descriptor)

              if (match.label !== 'unknown') {
                const teacher = enrolledTeachers.find(t => t.id === match.label)
                if (teacher) {
                  // Check cooldown (10 seconds per teacher)
                  const lastClock = cooldownMapRef.current.get(teacher.id) ?? 0
                  const inCooldown = Date.now() - lastClock < 10_000

                  if (!inCooldown && autoStateRef.current === 'scanning') {
                    // Draw green box with teacher name
                    drawRecognizedBox(ctx, mirroredX, scaledY, scaledW, scaledH, teacher.color)
                    drawNameLabel(ctx, mirroredX, scaledY, scaledW, teacher.name, teacher.color)

                    // Transition to 'recognized', then start countdown after 1 second
                    setAutoState('recognized')
                    setRecognizedTeacher(teacher)
                    recognizedTeacherRef.current = teacher

                    recognizedHoldTimerRef.current = setTimeout(() => {
                      if (autoStateRef.current === 'recognized') {
                        startCountdown(teacher)
                      }
                    }, 1000)
                  } else if (inCooldown) {
                    // In cooldown — draw yellow box
                    drawUnknownBox(ctx, mirroredX, scaledY, scaledW, scaledH, '#FECA57')
                  }
                }
              } else {
                // Face detected but not recognized
                drawUnknownBox(ctx, mirroredX, scaledY, scaledW, scaledH, '#FDCB6E')
              }
            }
          } else {
            // No enrolled teachers — just detect presence
            const detected = await faceapiLib.detectSingleFace(
              video,
              new faceapiLib.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
            )
            if (detected) {
              const { x, y, width, height } = detected.box
              const scaleX = dw / vw
              const scaleY = dh / vh
              const mirroredX = dw - (x + width) * scaleX
              drawUnknownBox(ctx, mirroredX, y * scaleY, width * scaleX, height * scaleY, '#FDCB6E')
            }
          }
        }
      }

      if (autoStateRef.current === 'scanning') {
        frameIdRef.current = requestAnimationFrame(runDetection)
      }
    }

    frameIdRef.current = requestAnimationFrame(runDetection)

    return () => {
      if (frameIdRef.current !== null) cancelAnimationFrame(frameIdRef.current)
      if (recognizedHoldTimerRef.current) clearTimeout(recognizedHoldTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoState, modelsReady, cameraError, buildMatcher, enrolledTeachers, startCountdown])

  // ─── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (frameIdRef.current !== null) cancelAnimationFrame(frameIdRef.current)
      if (recognizedHoldTimerRef.current) clearTimeout(recognizedHoldTimerRef.current)
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ─── Status bar message ──────────────────────────────────────────────────────
  const statusContent = (() => {
    if (cameraError) {
      return { text: 'Camera access denied — check permissions', icon: '📷', color: '#FF6B6B' }
    }
    switch (autoState) {
      case 'loading':
        return { text: 'Loading face recognition models...', icon: '⏳', color: '#636E72' }
      case 'scanning':
        return enrolledTeachers.length === 0
          ? { text: 'No enrolled teachers — enroll faces from the admin dashboard', icon: '👤', color: '#FDCB6E' }
          : { text: 'Waiting for someone to approach...', icon: '👀', color: '#636E72' }
      case 'recognized':
        return { text: `Recognized: ${recognizedTeacher?.name ?? ''}`, icon: '✅', color: recognizedTeacher?.color ?? '#00B894' }
      case 'countdown':
        return { text: `Clocking ${clockAction === 'in' ? 'in' : 'out'}: ${recognizedTeacher?.name ?? ''}`, icon: null, color: recognizedTeacher?.color ?? '#00B894' }
      case 'clocking':
        return { text: 'Recording clock event...', icon: '⏳', color: '#00B894' }
      case 'confirmed':
        return {
          text: clockAction === 'in' ? `Clocked In — ${recognizedTeacher?.name ?? ''}` : `Clocked Out — ${recognizedTeacher?.name ?? ''}`,
          icon: '✓',
          color: clockAction === 'in' ? '#00B894' : '#FF6B6B',
        }
      case 'error':
        return { text: 'Failed to load face recognition — refresh the page', icon: '⚠️', color: '#FF6B6B' }
    }
  })()

  const showGlow = autoState === 'recognized' || autoState === 'countdown' || autoState === 'confirmed'
  const glowColor = recognizedTeacher?.color ?? '#00B894'

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Hidden canvas for photo capture */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Live camera feed — CSS-mirrored */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Face detection overlay canvas */}
      {!cameraError && (
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 2 }}
        />
      )}

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 3,
          background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%)',
        }}
      />

      {/* Teacher color glow ring when recognized */}
      {showGlow && (
        <div
          className="absolute inset-0 pointer-events-none auto-glow-ring"
          style={{
            zIndex: 4,
            boxShadow: `inset 0 0 80px 30px ${glowColor}55`,
          }}
        />
      )}

      {/* Scanning pulse border when in scanning state */}
      {autoState === 'scanning' && (
        <div
          className="absolute inset-0 pointer-events-none scan-pulse-border"
          style={{ zIndex: 4 }}
        />
      )}

      {/* ── Top-left: Smart Mode label ─────────────────────────── */}
      <div className="absolute top-4 left-4 flex items-center gap-2" style={{ zIndex: 10 }}>
        <div className="w-2.5 h-2.5 rounded-full bg-[#00B894] smart-dot-pulse" />
        <span className="text-white/80 text-sm font-semibold tracking-widest uppercase">
          Smart Mode
        </span>
      </div>

      {/* ── Top-right: Live clock ──────────────────────────────── */}
      <div className="absolute top-4 right-4 text-white/70 text-sm font-semibold tabular-nums" style={{ zIndex: 10 }}>
        {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
      </div>

      {/* ── Center content area ────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>

        {/* Loading spinner */}
        {autoState === 'loading' && (
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#00B894] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          </div>
        )}

        {/* Countdown digits */}
        {autoState === 'countdown' && (
          <CountdownNumber key={countdown} value={countdown} color={recognizedTeacher?.color ?? '#00B894'} />
        )}

        {/* Confirmed checkmark */}
        {autoState === 'confirmed' && (
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center confirm-pop shadow-2xl"
              style={{
                backgroundColor: clockAction === 'in' ? '#00B894' : '#FF6B6B',
                boxShadow: `0 0 70px ${clockAction === 'in' ? '#00B89499' : '#FF6B6B99'}`,
              }}
            >
              <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                  style={{ strokeDasharray: 30, animation: 'draw-check 0.4s ease 0.15s forwards', strokeDashoffset: 30 }}
                />
              </svg>
            </div>
            <p className="text-white text-3xl font-bold confirm-slide-up drop-shadow-lg">
              {clockAction === 'in' ? 'Clocked In!' : 'Clocked Out!'}
            </p>
            <p className="text-white/70 text-xl confirm-slide-up-delay">
              {recognizedTeacher?.name}
            </p>
            <p className="text-white/50 text-lg confirm-slide-up-delay">
              {formatTime(currentTime)}
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom status bar ──────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 px-6 py-4 flex items-center justify-center gap-3"
        style={{
          zIndex: 10,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
          minHeight: 80,
        }}
      >
        <div
          className="flex items-center gap-3 px-6 py-3 rounded-2xl backdrop-blur-md border transition-all duration-500"
          style={{
            backgroundColor: `${statusContent.color}22`,
            borderColor: `${statusContent.color}55`,
            maxWidth: '90%',
          }}
        >
          {statusContent.icon && (
            <span className="text-xl leading-none">{statusContent.icon}</span>
          )}
          <span className="text-white font-semibold text-lg leading-tight">
            {statusContent.text}
          </span>
        </div>
      </div>

      {/* ── Recognised: name label above bounding box (handled on canvas), ──
           but also show a large centered name banner during 'recognized' state */}
      {autoState === 'recognized' && recognizedTeacher && (
        <div
          className="absolute top-16 left-0 right-0 flex justify-center"
          style={{ zIndex: 10 }}
        >
          <div
            className="px-8 py-3 rounded-2xl text-white text-2xl font-bold shadow-xl backdrop-blur-sm recognized-banner"
            style={{ backgroundColor: `${recognizedTeacher.color}CC` }}
          >
            {recognizedTeacher.name}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes smart-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.85); }
        }
        .smart-dot-pulse {
          animation: smart-dot-pulse 1.8s ease-in-out infinite;
        }

        @keyframes scan-pulse {
          0%, 100% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.08); }
          50%       { box-shadow: inset 0 0 0 3px rgba(255,255,255,0.22); }
        }
        .scan-pulse-border {
          animation: scan-pulse 2s ease-in-out infinite;
        }

        @keyframes auto-glow-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1; }
        }
        .auto-glow-ring {
          animation: auto-glow-pulse 1.2s ease-in-out infinite;
        }

        @keyframes recognized-in {
          from { transform: translateY(-12px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .recognized-banner {
          animation: recognized-in 0.3s ease forwards;
        }

        @keyframes auto-countdown-pop {
          0%   { transform: scale(1.7); opacity: 0; }
          25%  { transform: scale(0.93); opacity: 1; }
          75%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .auto-countdown-digit {
          animation: auto-countdown-pop 0.95s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes draw-check {
          from { stroke-dashoffset: 30; }
          to   { stroke-dashoffset: 0; }
        }

        @keyframes confirm-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          65%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .confirm-pop {
          animation: confirm-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes slide-up-fade {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .confirm-slide-up {
          animation: slide-up-fade 0.4s ease 0.3s both;
        }
        .confirm-slide-up-delay {
          animation: slide-up-fade 0.4s ease 0.45s both;
        }
      `}</style>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CountdownNumber({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="auto-countdown-digit font-bold drop-shadow-2xl select-none"
      style={{ fontSize: '10rem', lineHeight: 1, color }}
    >
      {value}
    </div>
  )
}

// ─── Canvas drawing helpers ────────────────────────────────────────────────────

function drawRecognizedBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string
) {
  const r = 14
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.shadowBlur = 20
  ctx.shadowColor = color
  ctx.stroke()
  ctx.restore()
}

function drawUnknownBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string
) {
  const r = 10
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.setLineDash([8, 6])
  ctx.stroke()
  ctx.restore()
}

function drawNameLabel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  name: string,
  color: string
) {
  const fontSize = Math.max(14, Math.min(22, w / 8))
  ctx.save()
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`
  const textW = ctx.measureText(name).width
  const padX = 12
  const padY = 6
  const labelH = fontSize + padY * 2
  const labelX = x + (w - textW - padX * 2) / 2
  const labelY = y - labelH - 6

  // Background pill
  ctx.fillStyle = `${color}DD`
  ctx.shadowBlur = 10
  ctx.shadowColor = color
  const br = labelH / 2
  ctx.beginPath()
  ctx.roundRect(labelX, labelY, textW + padX * 2, labelH, br)
  ctx.fill()

  // Text
  ctx.shadowBlur = 0
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(name, labelX + padX, labelY + padY + fontSize * 0.85)
  ctx.restore()
}
