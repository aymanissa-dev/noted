import Logo from './Logo.jsx';

export default function AuthCard({ title, children, footer }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="text-4xl" />
          <p className="mt-2 text-sm text-stone-500">Write it down. Find it later.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold">{title}</h1>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-stone-500">{footer}</p>
      </div>
    </div>
  );
}
