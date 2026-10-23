import { LoginForm } from '@/components/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <LoginForm redirectTo={from ?? '/'} />
    </div>
  )
}
