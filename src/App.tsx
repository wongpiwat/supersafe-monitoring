import { useEffect, useRef, useState } from 'react'

type ThreatLevel = 'none' | 'low' | 'medium' | 'high'

interface ThreatAnalysis {
  threatLevel: ThreatLevel
  summary: string
  confidence: number
  suggestedAction: string
}

interface ThreatEvent extends ThreatAnalysis {
  id: string
  timestamp: string
}

const VENICE_API_URL = 'https://api.venice.ai/api/v1/chat/completions'
const VENICE_MODEL = 'qwen3-vl-235b-a22b'

async function analyzeFrameWithVenice(dataUrl: string): Promise<ThreatAnalysis> {
  const apiKey = import.meta.env.VITE_VENICE_API_KEY

  if (!apiKey) {
    return {
      threatLevel: 'none',
      summary: 'Venice API key is not configured. Set VITE_VENICE_API_KEY in a .env file to enable detection.',
      confidence: 0,
      suggestedAction: 'Add your Venice API key to a local .env file. Do not commit it to version control.',
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

  const response = await fetch(VENICE_API_URL, {
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

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isCameraReady, setIsCameraReady] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<ThreatEvent[]>([])
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false)
  const [isBigScreen, setIsBigScreen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function setupCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not supported in this browser.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current
            .play()
            .catch(() => {
              // Autoplay might fail until user interacts; monitoring will still work after play starts.
            })
        }

        setIsCameraReady(true)
        setError(null)
      } catch (err) {
        console.error(err)
        setError('Unable to access the camera. Allow camera permissions and reload the page.')
        setIsCameraReady(false)
      }
    }

    setupCamera()

    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('supersafe-big-screen')
      if (stored === '1') {
        setIsBigScreen(true)
      }
    }

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isMonitoring || !isCameraReady) {
      return
    }

    let cancelled = false

    const captureAndAnalyze = async () => {
      if (cancelled || !videoRef.current || !canvasRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      if (!context) return

      const width = video.videoWidth || 640
      const height = video.videoHeight || 360

      canvas.width = width
      canvas.height = height
      context.drawImage(video, 0, 0, width, height)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)

      setIsAnalyzing(true)

      try {
        const analysis = await analyzeFrameWithVenice(dataUrl)

        if (cancelled) return

        if (analysis.threatLevel !== 'none') {
          const event: ThreatEvent = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            ...analysis,
          }

          setEvents((prev) => [event, ...prev].slice(0, 50))
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError('Unable to analyze frame with Venice. Check your API key and network connection.')
        }
      } finally {
        if (!cancelled) {
          setIsAnalyzing(false)
        }
      }
    }

    // Capture one frame immediately, then every few seconds
    captureAndAnalyze()
    const intervalId = window.setInterval(captureAndAnalyze, 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isMonitoring, isCameraReady])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('supersafe-big-screen', isBigScreen ? '1' : '0')
  }, [isBigScreen])

  const currentStatus = (() => {
    if (!isCameraReady) return 'Camera not ready'
    if (!isMonitoring) return 'Idle'
    if (isAnalyzing) return 'Analyzing frame…'
    return 'Monitoring'
  })()

  const statusColor = (() => {
    if (!isCameraReady) return 'bg-amber-500'
    if (!isMonitoring) return 'bg-slate-500'
    if (isAnalyzing) return 'bg-sky-500'
    return 'bg-emerald-500'
  })()

  const handleToggleMonitoring = () => {
    if (!isCameraReady) {
      setError('Camera is not ready yet. Check permissions and try again.')
      return
    }

    setError(null)
    setIsMonitoring((prev) => !prev)
  }

  const handleToggleBigScreen = () => {
    setIsBigScreen((prev) => {
      const next = !prev

      // if (next && document.documentElement.requestFullscreen) {
      //   document.documentElement.requestFullscreen().catch(() => {
      //     // Ignore fullscreen errors (e.g. user/browser blocks it)
      //   })
      // } else if (!next && document.fullscreenElement && document.exitFullscreen) {
      //   document.exitFullscreen().catch(() => {
      //     // Ignore exit errors
      //   })
      // }

      return next
    })
  }

  const headerContainerClass = isBigScreen
    ? 'mx-auto flex w-full items-center justify-between px-4 py-3 sm:px-6 sm:py-4'
    : 'mx-auto flex max-w-6xl items-center justify-between px-6 py-4'

  const mainContainerClass = isBigScreen
    ? 'mx-auto flex w-full flex-1 flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4 overflow-hidden lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:min-h-0'
    : 'mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 overflow-hidden lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:min-h-0'

  return (
    <div className="h-screen bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className={headerContainerClass}>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              SuperSafe Monitoring
            </h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              AI-powered threat detection with home security cameras — built for privacy.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleBigScreen}
              className="hidden rounded-full border border-slate-700/80 bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-200 shadow-sm shadow-slate-900/40 transition hover:border-emerald-400/70 hover:bg-emerald-500/10 sm:inline-flex sm:text-xs"
            >
              {isBigScreen ? 'Exit big screen' : 'Big screen'}
            </button>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900 px-3 py-1 text-[10px] font-medium text-slate-200 sm:text-xs">
              <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
              Live camera feed: {currentStatus}
            </span>
          </div>
        </div>
      </header>

      <main className={mainContainerClass}>
        <section className="flex h-full min-h-0 flex-col space-y-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm shadow-slate-900/40 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-50 sm:text-base">
                  Live camera feed
                </h2>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  Video is processed locally in your browser. Only sampled frames are analyzed by
                  Venice for threats.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={handleToggleMonitoring}
                  disabled={!isCameraReady}
                  className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-50 shadow-sm shadow-slate-900/40 transition hover:border-emerald-400/80 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500 sm:px-4 sm:py-2 sm:text-sm"
                >
                  {isMonitoring ? 'Stop monitoring' : 'Start monitoring'}
                </button>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 sm:text-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                  <span>{currentStatus}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/80 bg-black/50">
              <div className="relative aspect-video bg-slate-950">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                {!isCameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                    <p className="max-w-xs text-center text-xs text-slate-400 sm:text-sm">
                      Waiting for camera access… Allow permissions in your browser to see the live
                      feed.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>

          {error && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200 sm:px-4 sm:py-3 sm:text-sm">
              {error}
            </div>
          )}
        </section>

        <section className="flex h-full min-h-0 flex-col space-y-4">
          <div className="flex h-full flex-col rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm shadow-slate-900/40 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-50 sm:text-base">
                Threat activity timeline
              </h2>
              <span className="text-[11px] text-slate-400 sm:text-xs">
                {events.length === 0 ? 'No recent threats' : `${events.length} events`}
              </span>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/40 px-3 py-4 text-center text-xs text-slate-400 sm:text-sm">
                  When the system detects a potential threat, a summarized, encrypted event will
                  appear here. Raw video is never stored by this app.
                </p>
              ) : (
                events.map((event) => {
                  const date = new Date(event.timestamp)
                  const timeLabel = isNaN(date.getTime())
                    ? event.timestamp
                    : date.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })

                  const badgeClasses =
                    event.threatLevel === 'high'
                      ? 'bg-red-500/15 text-red-200 border-red-500/40'
                      : event.threatLevel === 'medium'
                        ? 'bg-amber-500/15 text-amber-100 border-amber-500/40'
                        : 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30'

                  const label =
                    event.threatLevel === 'high'
                      ? 'High threat'
                      : event.threatLevel === 'medium'
                        ? 'Medium threat'
                        : 'Low threat'

                  return (
                    <article
                      key={event.id}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-3 text-xs sm:px-4 sm:py-3 sm:text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:text-xs ${badgeClasses}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {label}
                        </span>
                        <span className="text-[10px] text-slate-500 sm:text-xs">{timeLabel}</span>
                      </div>
                      <p className="mt-2 text-slate-100">{event.summary}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 sm:text-xs">
                        <span>Confidence: {(event.confidence * 100).toFixed(0)}%</span>
                        <span className="truncate">
                          Recommended: <span className="text-slate-200">{event.suggestedAction}</span>
                        </span>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </div>

          {!isBigScreen && (
            <button
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
              className="group flex w-full flex-col rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-left text-xs text-slate-300 shadow-sm shadow-slate-900/40 transition hover:border-emerald-400/60 hover:bg-slate-900 sm:p-5 sm:text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-50 sm:text-base">
                  Privacy by design
                </h3>
                <span className="text-[11px] font-medium text-emerald-300 group-hover:text-emerald-200 sm:text-xs">
                  Learn more
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400 sm:mt-3 sm:text-sm">
                SuperSafe is built so that your home remains your private space, even while it&apos;s
                protected by AI.
              </p>
            </button>
          )}
        </section>
      </main>

      {isPrivacyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-modal-title"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300 shadow-xl shadow-black/60 sm:p-6 sm:text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="privacy-modal-title"
                  className="text-base font-semibold text-slate-50 sm:text-lg"
                >
                  Privacy by design
                </h2>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  SuperSafe Monitoring is intentionally designed so that powerful AI never comes at
                  the cost of your personal privacy.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPrivacyOpen(false)}
                className="rounded-full border border-slate-700/80 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 hover:bg-slate-800 sm:text-xs"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-100 sm:text-sm">
                  1. Local-first video processing
                </h3>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  Live camera feeds stay inside your browser. Frames are drawn to an in-memory
                  canvas purely for analysis and are never written to disk or stored on a server by
                  this app.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-100 sm:text-sm">
                  2. Ephemeral AI analysis
                </h3>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  At a fixed interval, a single compressed frame is sent to Venice for threat
                  analysis. The goal is to convert rich video into minimal structured metadata like
                  &quot;Unknown person detected at 2:14 AM&quot;, not to stream or archive footage.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-100 sm:text-sm">
                  3. Minimal, user-controlled data
                </h3>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  Only high-level incident summaries are kept in memory while the page is open.
                  There is no built-in cloud database or central log; you stay in control of how and
                  where incidents are stored or exported.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-100 sm:text-sm">
                  4. Secure API configuration
                </h3>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  The Venice API key is provided via local environment variables. It should never be
                  hard-coded in the client bundle or committed to version control, keeping your
                  credentials under your control.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isBigScreen && (
        <footer className="border-t border-slate-900/80 bg-slate-950/90 py-3 text-center text-[11px] text-slate-500 sm:py-4 sm:text-xs">
          Your home. Your data. Your control.
        </footer>
      )}
    </div>
  )
}

export default App
