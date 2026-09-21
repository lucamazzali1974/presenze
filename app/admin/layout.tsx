import { Nav } from '@/components/nav'
import { requireAccess } from '@/lib/auth'

/**
 * Il layout non decide piu' chi entra: ogni pagina sotto /admin dichiara
 * da se' quale sezione le serve, perche' ora sono sezioni diverse con
 * permessi diversi. Qui resta solo il menu.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { perms } = await requireAccess()

  return (
    <>
      <Nav perms={perms} />
      {children}
    </>
  )
}
