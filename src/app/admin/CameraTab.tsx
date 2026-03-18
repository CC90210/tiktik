'use client'

import { useState, useEffect, useCallback } from 'react'
import { Camera } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  centerId: string
  showToast: (msg: string) => void
}

interface CameraFormState {
  name: string
  location: string
  rtsp_url: string
  rtsp_username: string
  rtsp_password: string
  channel: number
  subtype: number
}

const LOCATION_OPTIONS = [
  'Entrance',
  'Classroom 1',
  'Classroom 2',
  'Hallway',
  'Playground',
  'Other',
]

const EMPTY_FORM: CameraFormState = {
  name: '',
  location: 'Entrance',
  rtsp_url: '',
  rtsp_username: 'admin',
  rtsp_password: '',
  channel: 1,
  subtype: 0,
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FormFieldProps {
  label: string
  children: React.ReactNode
  hint?: string
}

function FormField({ label, children, hint }: FormFieldProps) {
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
// CameraTab
// ---------------------------------------------------------------------------

export default function CameraTab({ centerId, showToast }: Props) {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CameraFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CameraFormState>(EMPTY_FORM)

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

  const addCamera = async () => {
    if (!form.name.trim() || !form.location) return
    setSaving(true)
    try {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_id: centerId,
          name: form.name.trim(),
          location: form.location,
          rtsp_url: form.rtsp_url.trim() || null,
          rtsp_username: form.rtsp_username.trim() || null,
          rtsp_password: form.rtsp_password || null,
          channel: form.channel,
          subtype: form.subtype,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast((err as { error?: string }).error ?? 'Failed to add camera')
        return
      }
      setForm(EMPTY_FORM)
      await fetchCameras()
      showToast(`${form.name.trim()} added!`)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (camera: Camera) => {
    setEditingId(camera.id)
    setEditForm({
      name: camera.name,
      location: camera.location,
      rtsp_url: camera.rtsp_url ?? '',
      rtsp_username: camera.rtsp_username ?? 'admin',
      rtsp_password: '',
      channel: camera.channel,
      subtype: camera.subtype,
    })
  }

  const saveEdit = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/cameras', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: editForm.name.trim(),
          location: editForm.location,
          rtsp_url: editForm.rtsp_url.trim() || null,
          rtsp_username: editForm.rtsp_username.trim() || null,
          rtsp_password: editForm.rtsp_password || null,
          channel: editForm.channel,
          subtype: editForm.subtype,
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
  // Render helpers
  // ---------------------------------------------------------------------------

  function CameraForm({
    values,
    onChange,
    onSubmit,
    submitLabel,
    onCancel,
  }: {
    values: CameraFormState
    onChange: (next: CameraFormState) => void
    onSubmit: () => void
    submitLabel: string
    onCancel?: () => void
  }) {
    const set = (key: keyof CameraFormState, value: string | number) =>
      onChange({ ...values, [key]: value })

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Camera Name */}
        <FormField label="Camera Name">
          <input
            type="text"
            value={values.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Front Door Camera"
            className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] placeholder-[#B2BEC3]"
          />
        </FormField>

        {/* Location */}
        <FormField label="Location">
          <select
            value={values.location}
            onChange={e => set('location', e.target.value)}
            className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] bg-white text-[#2D3436]"
          >
            {LOCATION_OPTIONS.map(loc => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </FormField>

        {/* RTSP URL */}
        <FormField label="IP Address / RTSP URL" hint="e.g. 192.168.1.100:554">
          <div className="flex items-center border border-[#E9EEF2] rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#00B894]/30 focus-within:border-[#00B894]">
            <span className="px-3 py-2.5 bg-[#F8F9FC] text-[#B2BEC3] text-xs font-mono border-r border-[#E9EEF2] select-none whitespace-nowrap">
              rtsp://
            </span>
            <input
              type="text"
              value={values.rtsp_url}
              onChange={e => set('rtsp_url', e.target.value)}
              placeholder="192.168.1.100:554"
              className="flex-1 px-3 py-2.5 text-sm outline-none bg-white font-mono text-[#2D3436] placeholder-[#B2BEC3]"
            />
          </div>
        </FormField>

        {/* Username */}
        <FormField label="Username">
          <input
            type="text"
            value={values.rtsp_username}
            onChange={e => set('rtsp_username', e.target.value)}
            placeholder="admin"
            className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] placeholder-[#B2BEC3]"
          />
        </FormField>

        {/* Password */}
        <FormField label="Password">
          <input
            type="password"
            value={values.rtsp_password}
            onChange={e => set('rtsp_password', e.target.value)}
            placeholder={values.rtsp_url ? '••••••••' : 'Enter password'}
            autoComplete="new-password"
            className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] placeholder-[#B2BEC3]"
          />
        </FormField>

        {/* Channel */}
        <FormField label="Channel" hint="Usually 1 for single-channel cameras">
          <input
            type="number"
            min={1}
            max={64}
            value={values.channel}
            onChange={e => set('channel', parseInt(e.target.value, 10) || 1)}
            className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]"
          />
        </FormField>

        {/* Stream Quality toggle — spans full width on its own row */}
        <div className="sm:col-span-2">
          <FormField label="Stream Quality">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('subtype', 0)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                  values.subtype === 0
                    ? 'bg-[#00B894] text-white border-[#00B894] shadow-sm'
                    : 'bg-white text-[#636E72] border-[#E9EEF2] hover:bg-[#F8F9FC]'
                }`}
              >
                Main Stream (HD)
              </button>
              <button
                type="button"
                onClick={() => set('subtype', 1)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                  values.subtype === 1
                    ? 'bg-[#0984E3] text-white border-[#0984E3] shadow-sm'
                    : 'bg-white text-[#636E72] border-[#E9EEF2] hover:bg-[#F8F9FC]'
                }`}
              >
                Sub Stream (SD)
              </button>
            </div>
          </FormField>
        </div>

        {/* Action buttons */}
        <div className="sm:col-span-2 flex gap-3 pt-1">
          <button
            onClick={onSubmit}
            disabled={!values.name.trim() || saving}
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
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
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

      {/* Add Camera section */}
      <div>
        <p className="text-sm font-semibold text-[#2D3436] mb-4">Add Camera</p>
        <CameraForm
          values={form}
          onChange={setForm}
          onSubmit={addCamera}
          submitLabel="+ Add Camera"
        />
      </div>

      {/* Divider */}
      {cameras.length > 0 && <hr className="border-[#E9EEF2]" />}

      {/* Camera grid */}
      {cameras.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 bg-[#F8F9FC] rounded-2xl flex items-center justify-center text-3xl">
            📹
          </div>
          <p className="font-semibold text-[#2D3436]">No cameras yet</p>
          <p className="text-sm text-[#B2BEC3] max-w-xs">
            Add your first IP camera above to start monitoring your center.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-[#2D3436]">
            Cameras
            <span className="ml-2 bg-[#F1F2F6] text-[#636E72] text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {cameras.length}
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map(camera => {
              const isEditing = editingId === camera.id
              const isConfigured = !!camera.rtsp_url

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
                    {/* Stream quality badge */}
                    <div className="absolute bottom-3 left-3">
                      <span className="bg-black/40 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
                        {camera.subtype === 0 ? 'HD' : 'SD'} · Ch {camera.channel}
                      </span>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    {isEditing ? (
                      <div className="space-y-4">
                        <CameraForm
                          values={editForm}
                          onChange={setEditForm}
                          onSubmit={() => saveEdit(camera.id)}
                          submitLabel="Save Changes"
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
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
                              {camera.rtsp_url}
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

      {/* go2rtc setup info */}
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
