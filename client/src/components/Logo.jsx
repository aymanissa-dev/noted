export default function Logo({ className = 'text-2xl', bounce = false }) {
  return <span className={`font-bold tracking-tight ${className}`}>noted<span className={`inline-block text-accent ${bounce ? 'animate-dot-bounce' : ''}`}>.</span></span>;
}
