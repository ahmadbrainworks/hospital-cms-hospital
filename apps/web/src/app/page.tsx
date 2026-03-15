import { redirect } from 'next/navigation';

// Root redirects to dashboard (which redirects to login if not auth'd)
export default function RootPage() {
  redirect('/dashboard');
}
