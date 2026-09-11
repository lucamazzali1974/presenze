import { Nav } from '@/components/nav'
import { requireAdmin } from '@/lib/auth'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireAdmin()

  return (
    <>
      <Nav profile={profile} />
      {children}
    </>
  )
}
