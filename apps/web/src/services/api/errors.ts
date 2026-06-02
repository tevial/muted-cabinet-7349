export const readApiErrorMessage = async (response: Response, fallback: string) => {
  const message = await response.text()
  if (!message) return fallback

  try {
    const parsed = JSON.parse(message) as { detail?: unknown }
    return typeof parsed.detail === 'string' ? parsed.detail : message
  } catch {
    return message
  }
}
