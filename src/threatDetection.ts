export type ThreatLevel = 'none' | 'low' | 'medium' | 'high'

export interface ThreatAnalysis {
  threatLevel: ThreatLevel
  summary: string
  confidence: number
  suggestedAction: string
}

export interface ThreatEvent extends ThreatAnalysis {
  id: string
  timestamp: string
}

const VENICE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions'
const VENICE_SPEECH_URL = 'https://api.venice.ai/api/v1/audio/speech'
const VENICE_MODEL = 'qwen3-vl-235b-a22b'

const audioQueue: string[] = []
let isPlayingQueue = false

export async function analyzeFrameWithVenice(dataUrl: string): Promise<ThreatAnalysis> {
  const apiKey = import.meta.env.VITE_VENICE_API_KEY

  if (!apiKey) {
    return {
      threatLevel: 'none',
      summary:
        'Venice API key is not configured. Set VITE_VENICE_API_KEY in a .env file to enable detection.',
      confidence: 0,
      suggestedAction:
        'Add your Venice API key to a local .env file. Do not commit it to version control.',
    }
  }

  const instruction =
    'You are a privacy-first home security assistant. Analyze this single video frame from a home security camera and detect any potential threats such as intruders, unknown persons, weapons, fire, or dangerous situations. ' +
    'Respond ONLY with a compact JSON object using this TypeScript type: ' +
    '{ "threatLevel": "none" | "low" | "medium" | "high", "summary": string, "confidence": number, "suggestedAction": string }.'

  const body = {
    model: VENICE_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: instruction },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  } as const

  const response = await fetch(VENICE_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Venice API error: ${response.status} ${text}`)
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content

  const rawText =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part: { type?: string; text?: string }) =>
              part.type === 'text' ? part.text ?? '' : '',
            )
            .join('\n')
        : ''

  try {
    const parsed = JSON.parse(rawText)

    const level = String(parsed.threatLevel ?? 'none').toLowerCase() as ThreatLevel

    return {
      threatLevel: level === 'low' || level === 'medium' || level === 'high' ? level : 'none',
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary provided.',
      confidence:
        typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
          ? parsed.confidence
          : 0,
      suggestedAction:
        typeof parsed.suggestedAction === 'string'
          ? parsed.suggestedAction
          : 'No suggested action provided.',
    }
  } catch {
    return {
      threatLevel: 'none',
      summary: rawText || 'Unable to parse structured response from model.',
      confidence: 0,
      suggestedAction: 'Review the raw model output and adjust the prompt if necessary.',
    }
  }
}

export async function generateThreatSpeech(
  summary: string,
  suggestedAction: string,
  threatLevel: ThreatLevel,
) {
  const apiKey = import.meta.env.VITE_VENICE_API_KEY

  if (!apiKey) {
    return
  }

  const spokenText = `Security alert. Threat level: ${threatLevel}. ${summary}. Recommended action: ${suggestedAction}.`

  const body = {
    input: spokenText,
    model: 'tts-kokoro',
    response_format: 'mp3',
    speed: 1,
    streaming: false,
    voice: 'af_sky',
  } as const

  const response = await fetch(VENICE_SPEECH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    // If TTS fails, we still keep the main threat analysis experience working.
    // eslint-disable-next-line no-console
    console.error('Venice TTS error', response.status)
    return
  }

  const arrayBuffer = await response.arrayBuffer()
  const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)

  audioQueue.push(url)

  if (!isPlayingQueue) {
    void playNextInQueue()
  }
}

async function playNextInQueue() {
  const nextUrl = audioQueue.shift()

  if (!nextUrl) {
    isPlayingQueue = false
    return
  }

  isPlayingQueue = true

  const audio = new Audio(nextUrl)

  audio.addEventListener(
    'ended',
    () => {
      URL.revokeObjectURL(nextUrl)
      void playNextInQueue()
    },
    { once: true },
  )

  audio.play().catch((err) => {
    URL.revokeObjectURL(nextUrl)
    // eslint-disable-next-line no-console
    console.error('Unable to play alert audio', err)
    void playNextInQueue()
  })
}

