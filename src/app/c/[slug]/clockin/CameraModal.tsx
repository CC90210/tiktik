'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { TeacherStatus } from '@/lib/types'
import { formatTime } from '@/lib/utils'

interface Props {
  teacher: TeacherStatus
  onCapture: (photoBase64: string) => void
  onClose: () => void
}

// Load face-api.js entirely from CDN to avoid bundling TensorFlow.js (~160KB)
const FACEAPI_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js'
const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceapiLib: any = null

async function loadFaceApi(): Promise<typeof faceapiLib> {
  if (faceapiLib) return faceapiLib
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = FACEAPI_CDN
    script.onload = () => {
      // @vladmandic/face-api exposes itself as window.faceapi
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      faceapiLib = (window as any).faceapi
      resolve(faceapiLib)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

type DetectionState = 'loading' | 'no-face' | 'face-detected' | 'countdown' | 'done'

export default function CameraModal({ teacher, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)          // capture canvas (hidden)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)   // detection overlay canvas
  const streamRef = useRef<MediaStream | null>(null)
  const detectionLoopRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  const faceHeldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [detectionState, setDetectionState] = useState<DetectionState>('loading')
  const [cameraError, setCameraError] = useState(false)
  const [modelsReady, setModelsReady] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const [captured, setCaptured] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)

  const action = teacher.is_clocked_in ? 'out' : 'in'
  const accentColor = action === 'in' ? '#00B894' : '#FF6B6B'
  const actionLabel = action === 'in' ? 'Clocking In' : 'Clocking Out'
  const confirmLabel = action === 'in' ? 'Clocked In!' : 'Clocked Out!'

  // ─── Load face-api.js library + models from CDN ──────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadModels() {
      try {
        const api = await loadFaceApi()
        await api.nets.tinyFaceDetector.loadFromUri(MODEL_CDN)
        if (!cancelled) setModelsReady(true)
      } catch {
        // Models failed — fall back to plain countdown (no face detection)
        if (!cancelled) setModelsReady(false)
      }
    }

    loadModels()
    return () => { cancelled = true }
  }, [])

  // ─── Start camera ─────────────────────────────────────────────────────────
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

  // ─── Capture photo ────────────────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    setCapturedPhoto(dataUrl)
    setCaptured(true)
    streamRef.current?.getTracks().forEach(t => t.stop())
    onCapture(dataUrl)
    setTimeout(onClose, 2000)
  }, [onCapture, onClose])

  // ─── Start countdown ──────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    if (countdownIntervalRef.current) return // already running
    setDetectionState('countdown')
    setCountdown(3)

    let current = 3
    countdownIntervalRef.current = setInterval(() => {
      current -= 1
      setCountdown(current)
      if (current <= 0) {
        clearInterval(countdownIntervalRef.current!)
        countdownIntervalRef.current = null
        capturePhoto()
      }
    }, 1000)
  }, [capturePhoto])

  // ─── Detection loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!modelsReady || cameraError || captured) return

    let frameId: ReturnType<typeof requestAnimationFrame>

    const runDetection = async () => {
      const video = videoRef.current
      const overlayCanvas = overlayCanvasRef.current

      if (
        video &&
        overlayCanvas &&
        video.readyState >= 2 &&
        video.videoWidth > 0
      ) {
        // Match canvas dimensions to video display size
        const { videoWidth: vw, videoHeight: vh } = video
        const displayWidth = video.offsetWidth
        const displayHeight = video.offsetHeight
        overlayCanvas.width = displayWidth
        overlayCanvas.height = displayHeight

        const ctx = overlayCanvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, displayWidth, displayHeight)

          const detections = await faceapiLib.detectAllFaces(
            video,
            new faceapiLib.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
          )

          // Scale detections from video resolution → display resolution
          const scaleX = displayWidth / vw
          const scaleY = displayHeight / vh

          // Draw face guide oval (always visible)
          drawFaceGuideOval(ctx, displayWidth, displayHeight, detections.length > 0)

          if (detections.length > 0) {
            // Draw bounding box(es) — mirror the x-axis because video is CSS-mirrored
            for (const det of detections) {
              const { x, y, width, height } = det.box
              const mirroredX = displayWidth - (x + width) * scaleX
              const scaledY = y * scaleY
              const scaledW = width * scaleX
              const scaledH = height * scaleY
              drawFaceBox(ctx, mirroredX, scaledY, scaledW, scaledH, accentColor)
            }

            // Transition to face-detected → start hold timer
            setDetectionState(prev => {
              if (prev === 'no-face' || prev === 'loading') {
                // Start 1s hold timer before kicking off countdown
                faceHeldTimerRef.current = setTimeout(startCountdown, 800)
                return 'face-detected'
              }
              return prev
            })
          } else {
            // Face lost — cancel hold timer and reset to no-face (unless already counting down)
            setDetectionState(prev => {
              if (prev === 'face-detected' || prev === 'loading') {
                if (faceHeldTimerRef.current) {
                  clearTimeout(faceHeldTimerRef.current)
                  faceHeldTimerRef.current = null
                }
                return 'no-face'
              }
              return prev
            })
          }
        }
      } else {
        // Video not ready yet
        setDetectionState(prev => prev === 'loading' ? 'loading' : prev)
      }

      frameId = requestAnimationFrame(runDetection)
    }

    frameId = requestAnimationFrame(runDetection)
    detectionLoopRef.current = frameId

    return () => {
      cancelAnimationFrame(frameId)
      if (faceHeldTimerRef.current) clearTimeout(faceHeldTimerRef.current)
    }
  }, [modelsReady, cameraError, captured, accentColor, startCountdown])

  // ─── Fallback: no face detection — just start countdown when camera is ready
  useEffect(() => {
    if (modelsReady || cameraError || captured) return

    // Give models 4 seconds to load before falling back
    const fallbackTimer = setTimeout(() => {
      if (!modelsReady) startCountdown()
    }, 4000)

    return () => clearTimeout(fallbackTimer)
  }, [modelsReady, cameraError, captured, startCountdown])

  // ─── ESC to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !captured) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, captured])

  // ─── Cleanup countdownInterval on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
      if (faceHeldTimerRef.current) clearTimeout(faceHeldTimerRef.current)
    }
  }, [])

  // ─── Status message ───────────────────────────────────────────────────────
  const statusMessage = (() => {
    if (cameraError) return null
    switch (detectionState) {
      case 'loading':       return 'Starting camera...'
      case 'no-face':       return 'Position your face in the frame'
      case 'face-detected': return 'Face detected — hold still...'
      case 'countdown':     return null // countdown digits take over
      case 'done':          return null
    }
  })()

  const faceIsDetected = detectionState === 'face-detected' || detectionState === 'countdown'

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />

      {!captured ? (
        <>
          {/* Live camera feed — mirrored so it feels like a mirror */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Face detection overlay canvas — sits on top of video */}
          {!cameraError && (
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 2 }}
            />
          )}

          {/* Dark vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 3,
              background: 'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.58) 100%)',
            }}
          />

          {/* Top banner: teacher name + action */}
          <div className="absolute top-0 left-0 right-0 flex justify-center pt-8 pb-4" style={{ zIndex: 10 }}>
            <div
              className="px-8 py-3 rounded-2xl text-white text-2xl font-bold shadow-xl backdrop-blur-sm"
              style={{ backgroundColor: `${teacher.color}CC` }}
            >
              {teacher.name} &mdash; {actionLabel}
            </div>
          </div>

          {/* Status message */}
          {statusMessage && (
            <div
              className="absolute bottom-24 left-0 right-0 flex justify-center px-6"
              style={{ zIndex: 10 }}
            >
              <div
                className="px-6 py-3 rounded-full text-white text-lg font-semibold backdrop-blur-md shadow-lg transition-all duration-300"
                style={{
                  backgroundColor: faceIsDetected ? `${accentColor}CC` : 'rgba(0,0,0,0.65)',
                  border: faceIsDetected ? `2px solid ${accentColor}` : '2px solid rgba(255,255,255,0.2)',
                }}
              >
                {statusMessage}
              </div>
            </div>
          )}

          {/* Countdown digits */}
          {detectionState === 'countdown' && (
            <div className="relative flex items-center justify-center" style={{ zIndex: 10 }}>
              <CountdownNumber key={countdown} value={countdown} />
            </div>
          )}

          {/* Pulsing glow ring when face detected */}
          {faceIsDetected && (
            <div
              className="absolute inset-0 pointer-events-none face-glow-ring"
              style={{
                zIndex: 4,
                boxShadow: `inset 0 0 60px 20px ${accentColor}44`,
              }}
            />
          )}

          {/* Camera error fallback */}
          {cameraError && (
            <div
              className="relative z-10 bg-black/70 backdrop-blur-md text-white p-8 rounded-3xl text-center max-w-sm mx-4 border border-white/10"
            >
              <div className="text-5xl mb-4">📷</div>
              <p className="text-xl font-bold mb-2">Camera Access Required</p>
              <p className="text-white/70 mb-6">
                Enable camera permissions in your device settings to clock {action}.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
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

          {/* Frame guide corners */}
          {!cameraError && (
            <div
              className="absolute inset-0 pointer-events-none flex items-center justify-center"
              style={{ zIndex: 5 }}
            >
              <div
                className="relative w-64 h-72 transition-all duration-300"
                style={{
                  filter: faceIsDetected ? `drop-shadow(0 0 12px ${accentColor})` : 'none',
                }}
              >
                {/* Top-left */}
                <div
                  className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg transition-colors duration-300"
                  style={{ borderColor: faceIsDetected ? accentColor : 'rgba(255,255,255,0.7)' }}
                />
                {/* Top-right */}
                <div
                  className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg transition-colors duration-300"
                  style={{ borderColor: faceIsDetected ? accentColor : 'rgba(255,255,255,0.7)' }}
                />
                {/* Bottom-left */}
                <div
                  className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg transition-colors duration-300"
                  style={{ borderColor: faceIsDetected ? accentColor : 'rgba(255,255,255,0.7)' }}
                />
                {/* Bottom-right */}
                <div
                  className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-lg transition-colors duration-300"
                  style={{ borderColor: faceIsDetected ? accentColor : 'rgba(255,255,255,0.7)' }}
                />
              </div>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm text-white w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium hover:bg-black/70 transition-colors border border-white/20"
            style={{ zIndex: 20 }}
            aria-label="Close"
          >
            ✕
          </button>
        </>
      ) : (
        /* ── Confirmation screen ─────────────────────────────────────────── */
        <div className="absolute inset-0 flex items-center justify-center">
          {capturedPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capturedPhoto}
              alt="Captured"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.3) blur(3px)' }}
            />
          )}
          <div className="relative z-10 flex flex-col items-center text-center px-8">
            {/* Animated checkmark circle */}
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center mb-6 shadow-2xl confirm-pop"
              style={{
                backgroundColor: accentColor,
                boxShadow: `0 0 70px ${accentColor}99`,
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
                  style={{ strokeDasharray: 30, animation: 'draw-check 0.4s ease 0.15s forwards', strokeDashoffset: 30 }}
                />
              </svg>
            </div>

            <h2 className="text-white text-5xl font-bold mb-3 drop-shadow-lg confirm-slide-up">
              {confirmLabel}
            </h2>
            <p className="text-white/80 text-2xl font-medium drop-shadow confirm-slide-up-delay">
              {teacher.name}
            </p>
            <p className="text-white/50 text-xl mt-2 confirm-slide-up-delay">
              {formatTime(new Date())}
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes countdown-pop {
          0%   { transform: scale(1.7); opacity: 0; }
          25%  { transform: scale(0.93); opacity: 1; }
          75%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .countdown-digit {
          animation: countdown-pop 0.95s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
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

        @keyframes face-glow-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        .face-glow-ring {
          animation: face-glow-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function drawFaceGuideOval(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  facePresent: boolean
) {
  const cx = w / 2
  const cy = h / 2 - h * 0.04 // slightly above centre
  const rx = w * 0.22
  const ry = h * 0.30

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.setLineDash([10, 8])
  ctx.lineWidth = 2.5
  ctx.strokeStyle = facePresent ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.55)'
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawFaceBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  const radius = 12
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.shadowBlur = 18
  ctx.shadowColor = color
  ctx.stroke()
  ctx.restore()
}

// Separate component so key-based re-mount triggers animation cleanly
function CountdownNumber({ value }: { value: number }) {
  return (
    <div
      className="countdown-digit text-white font-bold drop-shadow-2xl select-none"
      style={{ fontSize: '10rem', lineHeight: 1 }}
    >
      {value}
    </div>
  )
}
