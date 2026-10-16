import Image from 'next/image'
import type { User } from '@kb/shared'

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * GitHub avatar when the stored URL is usable, otherwise the first letter of
 * the username. Decorative: the username is rendered next to it.
 */
export function UserAvatar({ user }: { user: User }) {
  const { avatarUrl, username } = user

  if (avatarUrl !== null && isHttpsUrl(avatarUrl)) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="border-line bg-surface-raised size-8 shrink-0 rounded-full border"
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className="border-line bg-surface-raised text-ink-muted flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold uppercase"
    >
      {username.slice(0, 1)}
    </span>
  )
}
