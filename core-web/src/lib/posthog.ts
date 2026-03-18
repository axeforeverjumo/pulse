import posthog from 'posthog-js'

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
    },
  })
}

export function identifyUser(user: { id: string; email?: string; name?: string }) {
  posthog.identify(user.id, {
    email: user.email,
    name: user.name,
  })
}

export function resetUser() {
  posthog.reset()
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, properties)
}

export function trackPageView(path: string) {
  posthog.capture('$pageview', { $current_url: window.location.href, path })
}
