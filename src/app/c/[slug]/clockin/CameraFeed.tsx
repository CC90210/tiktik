'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── CDN constants — must match CameraModal.tsx and AutoClockIn.tsx ───────────
const FACEAPI_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js'
const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'

// Module-level singleton: reuse the same library instance loaded by
// CameraModal or AutoClockIn — whichever component mounted first.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceapiLib: any = null

async function loadFaceApi(): Promise<typeof faceapiLib> {
  if (faceapiLib) return faceapiLib
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).faceapi) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faceapiLib = (window as any).faceapi
    return faceapiLib
  }
  return new Promise((resolve, reject) => {
    // If CameraModal already injected the script tag, poll for readiness
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

interface Props {
  proxyUrl: string     // e.g. "http://192.168.1.50:1984"
  streamName: string   // e.g. "center_xxx_cam_1"
  onTeacherRecognized: (teacherId: string, photoBase64: string) => void
  enrolledTeachers: EnrolledTeacher[]
}

type ConnectionState = 'connecting' | 'connected' | 'error' | 'no-proxy'

// ─── WebRTC connection ─────────────────────────────────────────────────────────

async function connectWebRTC(proxyUrl: string, streamName: string): Promise<MediaStream> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  })

  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  const res = await fetch(`${proxyUrl}/api/webrtc?src=${encodeURIComponent(streamName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: offer.sdp,
  })

  if (!res.ok) {
    pc.close()
    throw new Error(`go2rtc SDP exchange failed: ${res.status}`)
  }

  const answerSdp = await res.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pc.close()
      reject(new Error('WebRTC track timeout — no stream received within 5s'))
    }, 5000)

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        clearTimeout(timeout)
        resolve(event.streams[0])
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        clearTimeout(timeout)
        pc.close()
        reject(new Error('ICE connection failed'))
      }
    }
  })
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function CameraFeed({
  proxyUrl,
  streamName,
  onTeacherRecognized,
  enrolledTeachers,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const detectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recognizedHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  // Stored in a ref so connect() can call it without creating a circular dep
  const scheduleReconnectRef = useRef<() => void>(() => { /* initialized below */ })
  const MAX_RECONNECT_ATTEMPTS = 5

  const [connState, setConnState] = useState<ConnectionState>('connecting')
  const [modelsReady, setModelsReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [countdown, setCountdown] = useState(3)
  const [recognizedTeacher, setRecognizedTeacher] = useState<EnrolledTeacher | null>(null)
  // 'scanning' | 'recognized' | 'countdown' | 'triggered'
  const [recognitionState, setRecognitionState] = useState<'scanning' | 'recognized' | 'countdown' | 'triggered'>('scanning')

  // Stable refs to avoid stale closures inside the interval-based detection loop
  const connStateRef = useRef<ConnectionState>('connecting')
  const recognitionStateRef = useRef<'scanning' | 'recognized' | 'countdown' | 'triggered'>('scanning')
  const recognizedTeacherRef = useRef<EnrolledTeacher | null>(null)

  useEffect(() => { connStateRef.current = connState }, [connState])
  useEffect(() => { recognitionStateRef.current = recognitionState }, [recognitionState])
  useEffect(() => { recognizedTeacherRef.current = recognizedTeacher }, [recognizedTeacher])

  // ─── Clock tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // ─── Load face-api + all three models ────────────────────────────────────────
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
        // Models failed — recognition will be unavailable but feed still shows
        if (!cancelled) setModelsReady(false)
      }
    }

    loadModels()
    return () => { cancelled = true }
  }, [])

  // ─── Capture photo from IP camera feed ───────────────────────────────────────
  const capturePhoto = useCallback((): string => {
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return ''
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    // IP camera feeds are NOT mirrored — draw without transform
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, [])

  // ─── Trigger recognized callback (after countdown) ───────────────────────────
  const triggerRecognized = useCallback((teacher: EnrolledTeacher) => {
    setRecognitionState('triggered')
    const photo = capturePhoto()
    onTeacherRecognized(teacher.id, photo)

    // Reset to scanning after 3 seconds
    const reset = setTimeout(() => {
      setRecognizedTeacher(null)
      setCountdown(3)
      setRecognitionState('scanning')
    }, 3000)

    return () => clearTimeout(reset)
  }, [capturePhoto, onTeacherRecognized])

  // ─── Start countdown ─────────────────────────────────────────────────────────
  const startCountdown = useCallback((teacher: EnrolledTeacher) => {
    if (countdownIntervalRef.current) return
    setRecognitionState('countdown')
    setCountdown(3)

    let current = 3
    countdownIntervalRef.current = setInterval(() => {
      current -= 1
      setCountdown(current)
      if (current <= 0) {
        clearInterval(countdownIntervalRef.current!)
        countdownIntervalRef.current = null
        triggerRecognized(teacher)
      }
    }, 1000)
  }, [triggerRecognized])

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

  // ─── Face detection loop (interval-based, not rAF — IP cameras cap at 15fps) ──
  useEffect(() => {
    if (!modelsReady || connState !== 'connected') return

    const faceMatcher = buildMatcher()

    const runDetection = async () => {
      if (recognitionStateRef.current !== 'scanning') return

      const video = videoRef.current
      const overlay = overlayCanvasRef.current
      if (!video || !overlay || video.readyState < 2 || video.videoWidth === 0) return

      const { videoWidth: vw, videoHeight: vh } = video
      const dw = overlay.offsetWidth
      const dh = overlay.offsetHeight
      overlay.width = dw
      overlay.height = dh

      const ctx = overlay.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, dw, dh)

      const scaleX = dw / vw
      const scaleY = dh / vh

      if (faceMatcher) {
        const detection = await faceapiLib
          .detectSingleFace(video, new faceapiLib.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor()

        if (detection) {
          const { x, y, width, height } = detection.detection.box
          // IP camera feeds are not CSS-mirrored — no x-axis flip needed
          const scaledX = x * scaleX
          const scaledY = y * scaleY
          const scaledW = width * scaleX
          const scaledH = height * scaleY

          const match = faceMatcher.findBestMatch(detection.descriptor)

          if (match.label !== 'unknown') {
            const teacher = enrolledTeachers.find(t => t.id === match.label)
            if (teacher && recognitionStateRef.current === 'scanning') {
              drawRecognizedBox(ctx, scaledX, scaledY, scaledW, scaledH, teacher.color)
              drawNameLabel(ctx, scaledX, scaledY, scaledW, teacher.name, teacher.color)

              setRecognitionState('recognized')
              setRecognizedTeacher(teacher)
              recognizedTeacherRef.current = teacher

              recognizedHoldTimerRef.current = setTimeout(() => {
                if (recognitionStateRef.current === 'recognized') {
                  startCountdown(teacher)
                }
              }, 1000)
            }
          } else {
            // Face present but not recognized
            drawUnknownBox(ctx, scaledX, scaledY, scaledW, scaledH, '#FDCB6E')
          }
        }
      } else {
        // No enrolled teachers — just show presence detection
        const detected = await faceapiLib.detectSingleFace(
          video,
          new faceapiLib.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        )
        if (detected) {
          const { x, y, width, height } = detected.box
          drawUnknownBox(ctx, x * scaleX, y * scaleY, width * scaleX, height * scaleY, '#FDCB6E')
        }
      }

      // Schedule next detection — 500ms is plenty for an IP camera feed
      detectionTimerRef.current = setTimeout(runDetection, 500)
    }

    detectionTimerRef.current = setTimeout(runDetection, 500)

    return () => {
      if (detectionTimerRef.current) clearTimeout(detectionTimerRef.current)
      if (recognizedHoldTimerRef.current) clearTimeout(recognizedHoldTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsReady, connState, buildMatcher, enrolledTeachers, startCountdown])

  // ─── HLS fallback helper ──────────────────────────────────────────────────────
  const tryHlsFallback = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const hlsUrl = `${proxyUrl}/api/stream.m3u8?src=${encodeURIComponent(streamName)}`

    // Native HLS (Safari) or MSE-based players via src
    video.src = hlsUrl
    video.load()

    const onCanPlay = () => {
      setConnState('connected')
      reconnectAttemptsRef.current = 0
    }
    const onError = () => {
      setConnState('error')
    }

    video.addEventListener('canplay', onCanPlay, { once: true })
    video.addEventListener('error', onError, { once: true })
  }, [proxyUrl, streamName])

  // ─── WebRTC connect + reconnect logic ────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!proxyUrl) {
      setConnState('no-proxy')
      return
    }

    setConnState('connecting')

    // Clear any previous peer connection
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    try {
      const stream = await connectWebRTC(proxyUrl, streamName)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setConnState('connected')
      reconnectAttemptsRef.current = 0

      // Monitor stream health — if tracks go inactive, reconnect
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (connStateRef.current === 'connected') {
            scheduleReconnectRef.current()
          }
        })
      })
    } catch {
      // WebRTC failed — attempt HLS fallback
      tryHlsFallback()
    }
  }, [proxyUrl, streamName, tryHlsFallback])

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnState('error')
      return
    }

    reconnectAttemptsRef.current += 1
    setConnState('connecting')

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = setTimeout(() => {
      connect()
    }, 3000)
  }, [connect])

  // Keep the ref in sync so the track 'ended' closure always calls the latest version
  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect
  }, [scheduleReconnect])

  // ─── Initial connection ───────────────────────────────────────────────────────
  useEffect(() => {
    connect()

    // Capture videoRef.current at effect-run time so the cleanup closure
    // holds a stable reference (per react-hooks/exhaustive-deps rule).
    const videoEl = videoRef.current

    return () => {
      // Full cleanup on unmount or source change
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (detectionTimerRef.current) clearTimeout(detectionTimerRef.current)
      if (recognizedHoldTimerRef.current) clearTimeout(recognizedHoldTimerRef.current)
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null }

      // Stop any MediaStream tracks
      if (videoEl?.srcObject instanceof MediaStream) {
        videoEl.srcObject.getTracks().forEach(t => t.stop())
      }
    }
  // Only re-run if the camera source itself changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyUrl, streamName])

  // ─── Render ───────────────────────────────────────────────────────────────────

  const showGlow = recognitionState === 'recognized' || recognitionState === 'countdown' || recognitionState === 'triggered'
  const glowColor = recognizedTeacher?.color ?? '#00B894'

  return (
    <div className="relative w-full h-full bg-black overflow-hidden rounded-2xl">
      {/* Hidden canvas for photo capture */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Live IP camera feed — NOT mirrored (unlike webcam) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Face detection overlay canvas */}
      {connState === 'connected' && (
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 2 }}
        />
      )}

      {/* Subtle vignette for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 3,
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Teacher recognition glow ring */}
      {showGlow && (
        <div
          className="absolute inset-0 pointer-events-none cam-glow-ring"
          style={{
            zIndex: 4,
            boxShadow: `inset 0 0 60px 20px ${glowColor}55`,
          }}
        />
      )}

      {/* ── Top-left: connection status + camera name ─────────────── */}
      <div className="absolute top-3 left-3 flex items-center gap-2" style={{ zIndex: 10 }}>
        {connState === 'connected' ? (
          <span className="w-2.5 h-2.5 rounded-full bg-[#00B894] cam-live-dot" />
        ) : connState === 'connecting' ? (
          <span className="w-2.5 h-2.5 rounded-full bg-[#FECA57] cam-connecting-dot" />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]" />
        )}
        <span className="text-white/80 text-xs font-semibold tracking-wide truncate max-w-[140px]">
          {streamName}
        </span>
      </div>

      {/* ── Top-right: LIVE badge (only when connected) ───────────── */}
      {connState === 'connected' && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10" style={{ zIndex: 10 }}>
          <span className="w-2 h-2 rounded-full bg-[#FF6B6B] cam-live-dot" />
          <span className="text-white text-xs font-bold tracking-widest uppercase">Live</span>
        </div>
      )}

      {/* ── Bottom-right: timestamp ────────────────────────────────── */}
      {connState === 'connected' && (
        <div
          className="absolute bottom-3 right-3 text-white/60 text-xs font-semibold tabular-nums bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm"
          style={{ zIndex: 10 }}
        >
          {currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })}
        </div>
      )}

      {/* ── Recognized teacher banner ──────────────────────────────── */}
      {(recognitionState === 'recognized' || recognitionState === 'countdown') && recognizedTeacher && (
        <div
          className="absolute top-12 left-0 right-0 flex justify-center"
          style={{ zIndex: 10 }}
        >
          <div
            className="px-6 py-2 rounded-2xl text-white text-lg font-bold shadow-xl backdrop-blur-sm cam-recognized-banner"
            style={{ backgroundColor: `${recognizedTeacher.color}CC` }}
          >
            {recognizedTeacher.name}
          </div>
        </div>
      )}

      {/* ── Countdown digits ────────────────────────────────────────── */}
      {recognitionState === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
          <CamCountdownNumber key={countdown} value={countdown} color={recognizedTeacher?.color ?? '#00B894'} />
        </div>
      )}

      {/* ── Confirmed checkmark ────────────────────────────────────── */}
      {recognitionState === 'triggered' && recognizedTeacher && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center cam-confirm-pop shadow-2xl"
              style={{
                backgroundColor: recognizedTeacher.color,
                boxShadow: `0 0 50px ${recognizedTeacher.color}99`,
              }}
            >
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                  style={{ strokeDasharray: 30, animation: 'cam-draw-check 0.4s ease 0.15s forwards', strokeDashoffset: 30 }}
                />
              </svg>
            </div>
            <p className="text-white text-xl font-bold cam-slide-up drop-shadow-lg">
              {recognizedTeacher.name}
            </p>
          </div>
        </div>
      )}

      {/* ── Connecting overlay ──────────────────────────────────────── */}
      {connState === 'connecting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm" style={{ zIndex: 20 }}>
          <div className="w-10 h-10 border-4 border-[#00B894] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/80 text-sm font-semibold">Connecting to camera...</p>
        </div>
      )}

      {/* ── Error overlay ───────────────────────────────────────────── */}
      {connState === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/75 backdrop-blur-sm px-4" style={{ zIndex: 20 }}>
          <div className="text-3xl select-none">📡</div>
          <p className="text-white font-bold text-center">Camera unavailable</p>
          <p className="text-white/60 text-xs text-center leading-relaxed">
            Could not connect to<br />
            <span className="font-mono text-white/40">{proxyUrl}</span>
          </p>
          <button
            onClick={() => {
              reconnectAttemptsRef.current = 0
              connect()
            }}
            className="px-5 py-2 bg-[#00B894] text-white text-sm font-bold rounded-full hover:bg-[#00A381] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── No-proxy setup instructions ─────────────────────────────── */}
      {connState === 'no-proxy' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm px-6" style={{ zIndex: 20 }}>
          <div className="text-3xl select-none">🔧</div>
          <p className="text-white font-bold text-sm text-center">Camera proxy not configured</p>
          <p className="text-white/50 text-xs text-center leading-relaxed">
            Set up a go2rtc instance and configure<br />the proxy URL in camera settings.
          </p>
        </div>
      )}

      <style jsx global>{`
        @keyframes cam-live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.85); }
        }
        .cam-live-dot {
          animation: cam-live-pulse 1.8s ease-in-out infinite;
        }

        @keyframes cam-connecting-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .cam-connecting-dot {
          animation: cam-connecting-pulse 0.9s ease-in-out infinite;
        }

        @keyframes cam-glow-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1; }
        }
        .cam-glow-ring {
          animation: cam-glow-pulse 1.2s ease-in-out infinite;
        }

        @keyframes cam-recognized-in {
          from { transform: translateY(-10px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .cam-recognized-banner {
          animation: cam-recognized-in 0.25s ease forwards;
        }

        @keyframes cam-countdown-pop {
          0%   { transform: scale(1.7); opacity: 0; }
          25%  { transform: scale(0.93); opacity: 1; }
          75%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .cam-countdown-digit {
          animation: cam-countdown-pop 0.95s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes cam-draw-check {
          from { stroke-dashoffset: 30; }
          to   { stroke-dashoffset: 0; }
        }

        @keyframes cam-confirm-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          65%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .cam-confirm-pop {
          animation: cam-confirm-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes cam-slide-up {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .cam-slide-up {
          animation: cam-slide-up 0.35s ease 0.25s both;
        }
      `}</style>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CamCountdownNumber({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="cam-countdown-digit font-bold drop-shadow-2xl select-none"
      style={{ fontSize: '8rem', lineHeight: 1, color }}
    >
      {value}
    </div>
  )
}
