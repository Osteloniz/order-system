export function getAppUrl() {
  const appUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000'

  return appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl
}
