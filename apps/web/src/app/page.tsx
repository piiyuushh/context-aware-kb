import { redirect } from 'next/navigation'

export default function HomePage() {
  // `(app)`'s AuthGuard sends unauthenticated visitors on to /login.
  redirect('/notes')
}
