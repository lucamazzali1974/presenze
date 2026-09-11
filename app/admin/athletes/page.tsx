import { redirect } from 'next/navigation'

// La rosa ora vive su /atleti: visibile a tutti, modificabile dagli admin.
export default function AdminAthletesRedirect() {
  redirect('/atleti')
}
