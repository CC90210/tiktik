'use client'

import { useState, useEffect, useCallback } from 'react'
import { Camera } from '@/lib/types'
import { CAMERA_BRANDS, CameraBrand, buildRtspUrl, findBrand } from '@/lib/camera-brands'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  centerId: string
  showToast: (msg: string) => void
}

interface CameraFormValues {
  name: string
  location: string
  ip: string
  port: string
  user: string
  pass: string
  channel: string
  subtype: string
  path: string
}

type SetupStep = 'brand' | 'details' | 'done'

const LOCATION_OPTIONS = [
  'Entrance',
  'Classroom 1',
  'Classroom 2',
  'Classroom 3',
  'Hallway',
  'Playground',
  'Office',
  'Nap Room',
  'Kitchen',
  'Other',
]

function emptyForm(brand?: CameraBrand): CameraFormValues {
  return {
    name: '',
    location: 'Entrance',
    ip: '',
    port: String(brand?.defaultPort ?? 554),
    user: brand?.defaultUsername ?? 'admin',
    pass: '',
    channel: '1',
    subtype: '0',
    path: '',
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#636E72] mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-[#B2BEC3] mt-1">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brand Selector — Step 1
// ---------------------------------------------------------------------------

function BrandSelector({ onSelect }: { onSelect: (brand: CameraBrand) => void }) {
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-[#2D3436] mb-1">Select Your Camera Brand</h3>
        <p className="text-sm text-[#636E72]">
          Choose the brand of your camera system. We&apos;ll auto-configure the connection settings for you.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {CAMERA_BRANDS.map(brand => (
          <button
            key={brand.id}
            onClick={() => onSelect(brand)}
            className="group bg-white border-2 border-[#E9EEF2] rounded-2xl p-4 text-left hover:border-[#00B894] hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00B894]/30"
          >
            <div className="text-3xl mb-2">{brand.logo}</div>
            <p className="font-bold text-[#2D3436] text-sm group-hover:text-[#00B894] transition-colors">
              {brand.name}
            </p>
            <p className="text-xs text-[#B2BEC3] mt-1 leading-relaxed line-clamp-2">
              {brand.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Camera Details Form — Step 2
// ---------------------------------------------------------------------------

function CameraDetailsForm({
  brand,
  values,
  onChange,
  onSubmit,
  onBack,
  saving,
  submitLabel,
  onCancel,
}: {
  brand: CameraBrand
  values: CameraFormValues
  onChange: (next: CameraFormValues) => void
  onSubmit: () => void
  onBack?: () => void
  saving: boolean
  submitLabel: string
  onCancel?: () => void
}) {
  const set = (key: keyof CameraFormValues, value: string) =>
    onChange({ ...values, [key]: value })

  // Build live preview URL
  const previewUrl = buildRtspUrl(brand, {
    ip: values.ip || '192.168.1.x',
    port: values.port || '554',
    user: values.user || 'admin',
    pass: values.pass ? '••••' : 'password',
    channel: values.channel || '1',
    subtype: values.subtype || '0',
    path: values.path || '',
  })

  return (
    <div>
      {/* Brand header with back button */}
      <div className="flex items-center gap-3 mb-5">
        {onBack && (
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#F1F2F6] text-[#636E72] hover:bg-[#E9EEF2] transition-colors text-lg"
          >
            &larr;
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{brand.logo}</span>
          <div>
            <p className="font-bold text-[#2D3436]">{brand.name}</p>
            {brand.helpUrl && (
              <a
                href={brand.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#0984E3] hover:underline font-medium"
              >
                {brand.helpLabel} &rarr;
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Notes banner */}
      {brand.notes && (
        <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-[#F57F17] leading-relaxed">{brand.notes}</p>
        </div>
      )}

      {/* Form fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Camera Name — always shown */}
        <FormField label="Camera Name" hint="Give this camera a friendly name">
          <input
            type="text"
            value={values.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Front Door Camera"
            className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] placeholder-[#B2BEC3]"
          />
        </FormField>

        {/* Location — always shown */}
        <FormField label="Location">
          <select
            value={values.location}
            onChange={e => set('location', e.target.value)}
            className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] bg-white text-[#2D3436]"
          >
            {LOCATION_OPTIONS.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </FormField>

        {/* Dynamic brand-specific fields */}
        {brand.fields.map(field => (
          <FormField key={field.key} label={field.label} hint={field.hint}>
            <input
              type={field.type}
              value={values[field.key as keyof CameraFormValues] ?? ''}
              onChange={e => set(field.key as keyof CameraFormValues, e.target.value)}
              placeholder={field.placeholder}
              autoComplete={field.type === 'password' ? 'new-password' : undefined}
              className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] placeholder-[#B2BEC3]"
            />
          </FormField>
        ))}

        {/* Stream quality toggle — only for brands with subtype */}
        {brand.fields.some(f => f.key === 'subtype') && (
          <div className="sm:col-span-2">
            <FormField label="Stream Quality">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set('subtype', '0')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                    values.subtype === '0'
                      ? 'bg-[#00B894] text-white border-[#00B894] shadow-sm'
                      : 'bg-white text-[#636E72] border-[#E9EEF2] hover:bg-[#F8F9FC]'
                  }`}
                >
                  Main Stream (HD)
                </button>
                <button
                  type="button"
                  onClick={() => set('subtype', '1')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                    values.subtype === '1'
                      ? 'bg-[#0984E3] text-white border-[#0984E3] shadow-sm'
                      : 'bg-white text-[#636E72] border-[#E9EEF2] hover:bg-[#F8F9FC]'
                  }`}
                >
                  Sub Stream (SD)
                </button>
              </div>
            </FormField>
          </div>
        )}

        {/* Live URL preview */}
        <div className="sm:col-span-2">
          <FormField label="Connection Preview">
            <div className="bg-[#2D3436] rounded-xl px-4 py-3 overflow-x-auto">
              <code className="text-xs font-mono text-[#00B894] break-all whitespace-pre-wrap">
                {previewUrl}
              </code>
            </div>
          </FormField>
        </div>

        {/* Action buttons */}
        <div className="sm:col-span-2 flex gap-3 pt-1">
          <button
            onClick={onSubmit}
            disabled={!values.name.trim() || !values.ip.trim() || saving}
            className="px-6 py-2.5 bg-[#00B894] text-white rounded-xl font-semibold hover:bg-[#00A884] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {saving ? 'Saving…' : submitLabel}
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-[#F1F2F6] text-[#636E72] rounded-xl font-semibold hover:bg-[#E9EEF2] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CameraTab (main export)
// ---------------------------------------------------------------------------

export default function CameraTab({ centerId, showToast }: Props) {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Setup wizard state
  const [setupStep, setSetupStep] = useState<SetupStep>('brand')
  const [selectedBrand, setSelectedBrand] = useState<CameraBrand | null>(null)
  const [form, setForm] = useState<CameraFormValues>(emptyForm())
  const [showSetup, setShowSetup] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBrand, setEditBrand] = useState<CameraBrand | null>(null)
  const [editForm, setEditForm] = useState<CameraFormValues>(emptyForm())

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchCameras = useCallback(async () => {
    const res = await fetch(`/api/cameras?center_id=${centerId}`)
    const data = await res.json()
    if (Array.isArray(data)) setCameras(data)
    setLoading(false)
  }, [centerId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleBrandSelect = (brand: CameraBrand) => {
    setSelectedBrand(brand)
    setForm(emptyForm(brand))
    setSetupStep('details')
  }

  const resetSetup = () => {
    setShowSetup(false)
    setSetupStep('brand')
    setSelectedBrand(null)
    setForm(emptyForm())
  }

  const addCamera = async () => {
    if (!form.name.trim() || !form.ip.trim() || !selectedBrand) return
    setSaving(true)
    try {
      const rtspUrl = buildRtspUrl(selectedBrand, {
        ip: form.ip.trim(),
        port: form.port || '554',
        user: form.user || 'admin',
        pass: form.pass,
        channel: form.channel || '1',
        subtype: form.subtype || '0',
        path: form.path || '',
      })

      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_id: centerId,
          name: form.name.trim(),
          location: form.location,
          camera_brand: selectedBrand.id,
          rtsp_url: rtspUrl,
          rtsp_username: form.user.trim() || 'admin',
          rtsp_password: form.pass || null,
          channel: parseInt(form.channel, 10) || 1,
          subtype: parseInt(form.subtype, 10) || 0,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast((err as { error?: string }).error ?? 'Failed to add camera')
        return
      }
      showToast(`${form.name.trim()} added!`)
      resetSetup()
      await fetchCameras()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (camera: Camera) => {
    const brand = findBrand(camera.camera_brand ?? '') ?? CAMERA_BRANDS[CAMERA_BRANDS.length - 1]
    setEditBrand(brand)
    setEditingId(camera.id)

    // Parse the IP from the stored RTSP URL (strip rtsp://user:pass@ prefix and :port suffix)
    let ip = ''
    if (camera.rtsp_url) {
      try {
        const urlPart = camera.rtsp_url.replace(/^rtsp:\/\/[^@]*@/, '')
        ip = urlPart.split(':')[0] || urlPart.split('/')[0] || ''
      } catch {
        ip = ''
      }
    }

    setEditForm({
      name: camera.name,
      location: camera.location,
      ip,
      port: '554',
      user: camera.rtsp_username ?? 'admin',
      pass: '',
      channel: String(camera.channel),
      subtype: String(camera.subtype),
      path: '',
    })
  }

  const saveEdit = async (id: string) => {
    if (!editBrand) return
    setSaving(true)
    try {
      const rtspUrl = buildRtspUrl(editBrand, {
        ip: editForm.ip.trim(),
        port: editForm.port || '554',
        user: editForm.user || 'admin',
        pass: editForm.pass,
        channel: editForm.channel || '1',
        subtype: editForm.subtype || '0',
        path: editForm.path || '',
      })

      const res = await fetch('/api/cameras', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: editForm.name.trim(),
          location: editForm.location,
          camera_brand: editBrand.id,
          rtsp_url: rtspUrl,
          rtsp_username: editForm.user.trim() || 'admin',
          rtsp_password: editForm.pass || null,
          channel: parseInt(editForm.channel, 10) || 1,
          subtype: parseInt(editForm.subtype, 10) || 0,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast((err as { error?: string }).error ?? 'Failed to update camera')
        return
      }
      setEditingId(null)
      await fetchCameras()
      showToast('Camera updated!')
    } finally {
      setSaving(false)
    }
  }

  const deleteCamera = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? This cannot be undone.`)) return
    const res = await fetch('/api/cameras', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      showToast('Failed to delete camera')
      return
    }
    await fetchCameras()
    showToast(`${name} removed`)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6 py-16 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-[#00B894] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#636E72]">Loading cameras…</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Add Camera Section ─────────────────────────────────────────── */}
      {showSetup ? (
        <div className="bg-white border border-[#E9EEF2] rounded-2xl p-6 shadow-sm">
          {setupStep === 'brand' && (
            <BrandSelector onSelect={handleBrandSelect} />
          )}
          {setupStep === 'details' && selectedBrand && (
            <CameraDetailsForm
              brand={selectedBrand}
              values={form}
              onChange={setForm}
              onSubmit={addCamera}
              onBack={() => setSetupStep('brand')}
              saving={saving}
              submitLabel="+ Add Camera"
              onCancel={resetSetup}
            />
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowSetup(true)}
          className="w-full py-4 border-2 border-dashed border-[#E9EEF2] rounded-2xl text-[#636E72] font-semibold hover:border-[#00B894] hover:text-[#00B894] hover:bg-[#00B894]/5 transition-all duration-200 text-sm"
        >
          + Add Camera
        </button>
      )}

      {/* ── Existing Cameras ──────────────────────────────────────────── */}
      {cameras.length === 0 && !showSetup ? (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 bg-[#F8F9FC] rounded-2xl flex items-center justify-center text-3xl">
            📹
          </div>
          <p className="font-semibold text-[#2D3436]">No cameras yet</p>
          <p className="text-sm text-[#B2BEC3] max-w-xs">
            Click &quot;Add Camera&quot; to connect your first IP camera system.
          </p>
        </div>
      ) : cameras.length > 0 && (
        <>
          {showSetup && <hr className="border-[#E9EEF2]" />}
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-[#2D3436]">Your Cameras</p>
            <span className="bg-[#F1F2F6] text-[#636E72] text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {cameras.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map(camera => {
              const isEditing = editingId === camera.id
              const isConfigured = !!camera.rtsp_url
              const brand = findBrand(camera.camera_brand ?? '')

              return (
                <div
                  key={camera.id}
                  className="bg-[#F8F9FC] rounded-2xl border border-[#E9EEF2] overflow-hidden"
                >
                  {/* Stream preview placeholder */}
                  <div className="aspect-video bg-[#2D3436] flex flex-col items-center justify-center gap-2 relative">
                    <div className="text-4xl opacity-30">📹</div>
                    <p className="text-[#636E72] text-xs font-medium">
                      {isConfigured ? 'Stream preview coming soon' : 'Not configured'}
                    </p>
                    {/* Status dot */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          isConfigured ? 'bg-[#00B894] animate-pulse' : 'bg-[#FF9F43]'
                        }`}
                      />
                      <span className="text-white text-xs font-medium">
                        {isConfigured ? 'Configured' : 'No URL'}
                      </span>
                    </div>
                    {/* Brand & stream quality badges */}
                    <div className="absolute bottom-3 left-3 flex gap-2">
                      {brand && (
                        <span className="bg-black/40 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
                          {brand.logo} {brand.name}
                        </span>
                      )}
                      <span className="bg-black/40 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
                        {camera.subtype === 0 ? 'HD' : 'SD'} · Ch {camera.channel}
                      </span>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    {isEditing && editBrand ? (
                      <CameraDetailsForm
                        brand={editBrand}
                        values={editForm}
                        onChange={setEditForm}
                        onSubmit={() => saveEdit(camera.id)}
                        saving={saving}
                        submitLabel="Save Changes"
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2D3436] truncate">{camera.name}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[#B2BEC3] text-xs">📍</span>
                              <p className="text-xs text-[#636E72]">{camera.location}</p>
                            </div>
                          </div>
                        </div>

                        {/* RTSP info */}
                        {camera.rtsp_url && (
                          <div className="bg-white border border-[#E9EEF2] rounded-xl px-3 py-2 mb-3">
                            <p className="text-xs font-mono text-[#636E72] truncate">
                              <span className="text-[#B2BEC3]">rtsp://</span>
                              {camera.rtsp_username && (
                                <span className="text-[#6C5CE7]">{camera.rtsp_username}@</span>
                              )}
                              {camera.rtsp_url.replace(/^rtsp:\/\/[^@]*@/, '')}
                            </p>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(camera)}
                            className="flex-1 py-2 text-sm font-semibold text-[#636E72] bg-white border border-[#E9EEF2] rounded-xl hover:bg-[#F1F2F6] hover:text-[#2D3436] transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteCamera(camera.id, camera.name)}
                            className="py-2 px-3 text-sm font-semibold text-[#FF6B6B] bg-white border border-[#E9EEF2] rounded-xl hover:bg-[#FFF0F0] hover:border-[#FF6B6B]/30 transition-colors"
                            aria-label={`Delete ${camera.name}`}
                          >
                            ×
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── go2rtc Setup Info ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-sm">
        <div
          className="p-6"
          style={{ background: 'linear-gradient(135deg, #2D3436 0%, #636E72 100%)' }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                🖥️
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-base mb-0.5">Live Stream Proxy</p>
                <p className="text-white/70 text-sm">
                  To view live camera feeds, run go2rtc on a device on the same network as your
                  cameras. It proxies RTSP streams to your browser securely.
                </p>
              </div>
            </div>

            {/* Docker command */}
            <div>
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wide mb-2">
                Start with Docker
              </p>
              <div className="flex items-start gap-2">
                <code className="flex-1 bg-black/30 text-[#00B894] px-4 py-3 rounded-xl text-xs font-mono break-all backdrop-blur-sm leading-relaxed">
                  docker run -d --name go2rtc --network host -v ./go2rtc.yaml:/config/go2rtc.yaml
                  alexxit/go2rtc
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      'docker run -d --name go2rtc --network host -v ./go2rtc.yaml:/config/go2rtc.yaml alexxit/go2rtc'
                    )
                    showToast('Docker command copied!')
                  }}
                  className="px-3 py-3 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/20 transition-colors flex-shrink-0 border border-white/10"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Config note */}
            <div className="bg-white/10 border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/60 text-xs leading-relaxed">
                <span className="text-white font-semibold">go2rtc.yaml</span> — add each camera
                as a stream entry using its RTSP URL. Once running, the stream proxy name shown
                on each camera card will connect automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
