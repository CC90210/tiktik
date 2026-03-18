export interface BrandField {
  key: string
  label: string
  type: 'text' | 'number' | 'password'
  placeholder: string
  hint?: string
  required: boolean
}

export interface CameraBrand {
  id: string
  name: string
  logo: string
  description: string
  rtspTemplate: string
  defaultPort: number
  defaultUsername: string
  helpUrl: string
  helpLabel: string
  fields: BrandField[]
  notes: string
}

// ─── Shared field definitions ──────────────────────────────────────────────

const FIELD_IP: BrandField = {
  key: 'ip',
  label: 'Camera IP Address',
  type: 'text',
  placeholder: '192.168.1.100',
  hint: 'Find this in your router or NVR/DVR interface.',
  required: true,
}

const FIELD_PORT: BrandField = {
  key: 'port',
  label: 'RTSP Port',
  type: 'number',
  placeholder: '554',
  hint: 'Default is 554. Only change if you have a custom port forwarding rule.',
  required: true,
}

const FIELD_USERNAME: BrandField = {
  key: 'user',
  label: 'Username',
  type: 'text',
  placeholder: 'admin',
  required: true,
}

const FIELD_PASSWORD: BrandField = {
  key: 'pass',
  label: 'Password',
  type: 'password',
  placeholder: 'Enter camera password',
  required: true,
}

const FIELD_CHANNEL: BrandField = {
  key: 'channel',
  label: 'Channel Number',
  type: 'number',
  placeholder: '1',
  hint: 'Channel 1–64. Use 1 for single cameras.',
  required: true,
}

const FIELD_SUBTYPE: BrandField = {
  key: 'subtype',
  label: 'Stream Type',
  type: 'number',
  placeholder: '0',
  hint: '0 = main stream (high quality), 1 = sub stream (lower bandwidth).',
  required: true,
}

/** Standard fields for Dahua-based cameras (Lorex, Dahua, Amcrest, Swann) */
const DAHUA_FIELDS: BrandField[] = [
  FIELD_IP,
  FIELD_PORT,
  FIELD_USERNAME,
  FIELD_PASSWORD,
  FIELD_CHANNEL,
  FIELD_SUBTYPE,
]

/** Minimal fields for cameras that don't use channel/subtype */
const SIMPLE_FIELDS: BrandField[] = [
  FIELD_IP,
  FIELD_PORT,
  FIELD_USERNAME,
  FIELD_PASSWORD,
]

// ─── Brand registry ────────────────────────────────────────────────────────

export const CAMERA_BRANDS: CameraBrand[] = [
  {
    id: 'lorex',
    name: 'Lorex',
    logo: '📷',
    description: 'Popular NVR/DVR systems used in home and small business security.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/cam/realmonitor?channel={channel}&subtype={subtype}',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://www.lorextechnology.com/support',
    helpLabel: 'Lorex Support',
    fields: DAHUA_FIELDS,
    notes: 'Lorex NVRs run Dahua firmware. Channel starts at 1. Subtype 0 = main stream, 1 = sub stream.',
  },
  {
    id: 'hikvision',
    name: 'Hikvision',
    logo: '🔭',
    description: 'Enterprise-grade IP cameras and NVRs widely used in commercial settings.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/Streaming/Channels/{channel}01',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://www.hikvision.com/en/support/',
    helpLabel: 'Hikvision RTSP Guide',
    fields: [FIELD_IP, FIELD_PORT, FIELD_USERNAME, FIELD_PASSWORD, FIELD_CHANNEL],
    notes: 'The channel number is embedded in the path as X01 (main stream) or X02 (sub stream). Use the channel field to set X. For example, channel 1 main = 101.',
  },
  {
    id: 'dahua',
    name: 'Dahua',
    logo: '📸',
    description: 'Professional IP camera systems with wide compatibility.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/cam/realmonitor?channel={channel}&subtype={subtype}',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://www.dahuasecurity.com/support',
    helpLabel: 'Dahua Support',
    fields: DAHUA_FIELDS,
    notes: 'Subtype 0 = main stream (HD), 1 = sub stream (reduced bandwidth for remote viewing).',
  },
  {
    id: 'amcrest',
    name: 'Amcrest',
    logo: '🏠',
    description: 'Affordable NVR and IP camera systems built on Dahua firmware.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/cam/realmonitor?channel={channel}&subtype={subtype}',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://amcrest.com/support',
    helpLabel: 'Amcrest Support',
    fields: DAHUA_FIELDS,
    notes: 'Amcrest uses Dahua firmware. Subtype 0 = main stream, 1 = sub stream.',
  },
  {
    id: 'reolink',
    name: 'Reolink',
    logo: '🎥',
    description: 'Consumer and prosumer IP cameras with easy app setup.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/h264Preview_{channel}_{subtype}',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://reolink.com/support/',
    helpLabel: 'Reolink Support',
    fields: [FIELD_IP, FIELD_PORT, FIELD_USERNAME, FIELD_PASSWORD, FIELD_CHANNEL],
    notes: 'Enable RTSP in the Reolink app: Device Settings > Network > Advanced > Port Settings. For main stream use subtype "main", for sub stream use "sub". The stream URL uses h264Preview format.',
  },
  {
    id: 'swann',
    name: 'Swann',
    logo: '🦢',
    description: 'Consumer-grade NVR and DVR systems for home security.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/cam/realmonitor?channel={channel}&subtype={subtype}',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://www.swann.com/support',
    helpLabel: 'Swann Support',
    fields: DAHUA_FIELDS,
    notes: 'Most Swann NVRs run Dahua firmware. Try this format first. If it does not connect, try the Dahua brand instead — the URL format is identical.',
  },
  {
    id: 'axis',
    name: 'Axis',
    logo: '⚙️',
    description: 'Professional network cameras for commercial and enterprise deployments.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/axis-media/media.amp',
    defaultPort: 554,
    defaultUsername: 'root',
    helpUrl: 'https://www.axis.com/support',
    helpLabel: 'Axis Support',
    fields: SIMPLE_FIELDS,
    notes: 'Axis cameras typically do not use channel numbers — one camera per device. Default username is "root", not "admin". Create a user account in the camera web interface before connecting.',
  },
  {
    id: 'uniview',
    name: 'Uniview',
    logo: '🌐',
    description: 'Professional IP camera systems with ONVIF compatibility.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/unicast/c{channel}/s{subtype}/live',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://en.uniview.com/Support/',
    helpLabel: 'Uniview Support',
    fields: DAHUA_FIELDS,
    notes: 'Subtype 0 = main stream, 1 = sub stream. Channel numbers start at 1.',
  },
  {
    id: 'tplink-tapo',
    name: 'TP-Link / Tapo',
    logo: '📡',
    description: 'Smart home cameras with Tapo app integration and RTSP support.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/stream{subtype}',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: 'https://www.tp-link.com/us/support/',
    helpLabel: 'TP-Link Support',
    fields: SIMPLE_FIELDS,
    notes: 'Enable RTSP in the Tapo app: Camera Settings > Advanced Settings > Camera Account. Set a camera account username and password — these are separate from your Tapo account. Stream 1 = main (high quality), stream 2 = sub (lower bandwidth).',
  },
  {
    id: 'generic',
    name: 'Generic / Other',
    logo: '🔌',
    description: 'For any IP camera brand not listed above.',
    rtspTemplate: 'rtsp://{user}:{pass}@{ip}:{port}/{path}',
    defaultPort: 554,
    defaultUsername: 'admin',
    helpUrl: '',
    helpLabel: '',
    fields: [
      FIELD_IP,
      FIELD_PORT,
      FIELD_USERNAME,
      FIELD_PASSWORD,
      {
        key: 'path',
        label: 'RTSP Path',
        type: 'text',
        placeholder: 'cam/realmonitor?channel=1&subtype=0',
        hint: 'The path portion of your RTSP URL after the port. Check your camera manual or search "[brand] RTSP URL format".',
        required: false,
      },
    ],
    notes: 'Enter your camera\'s full RTSP URL path. Check your camera\'s manual or the manufacturer\'s website for the correct RTSP format. You can also search "[your brand] RTSP URL format" to find the right template.',
  },
]

// ─── Utility functions ─────────────────────────────────────────────────────

/**
 * Builds a complete RTSP URL by replacing all `{placeholder}` tokens in the
 * brand's rtspTemplate with the provided values.
 *
 * Special handling:
 * - Reolink: subtype 0 → "main", subtype 1 → "sub"
 * - TP-Link/Tapo: subtype 0 → "1" (stream1), subtype 1 → "2" (stream2)
 * - Generic: missing path defaults to empty string (bare rtsp://user:pass@ip:port/)
 */
export function buildRtspUrl(
  brand: CameraBrand,
  values: Record<string, string | number>
): string {
  let url = brand.rtspTemplate

  // Normalise values for brands that map subtype integers to path strings
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(values)) {
    resolved[key] = String(value)
  }

  if (brand.id === 'reolink') {
    const raw = Number(resolved['subtype'] ?? 0)
    resolved['subtype'] = raw === 0 ? 'main' : 'sub'
  }

  if (brand.id === 'tplink-tapo') {
    const raw = Number(resolved['subtype'] ?? 0)
    resolved['subtype'] = raw === 0 ? '1' : '2'
  }

  // Replace all {key} placeholders with their resolved values
  url = url.replace(/\{(\w+)\}/g, (_, key: string) => resolved[key] ?? '')

  return url
}

/**
 * Looks up a brand from the registry by its kebab-case ID.
 * Returns `undefined` if the ID is not found.
 */
export function findBrand(id: string): CameraBrand | undefined {
  return CAMERA_BRANDS.find((brand) => brand.id === id)
}
