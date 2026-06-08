import clsx from 'clsx'

interface Props {
  value: string
  variant?: 'auto'
}

export default function Badge({ value, variant }: Props) {
  if (variant === 'auto') {
    const v = value.toLowerCase()
    if (v === 'yes' || v === 'win') return <span className="badge-yes">{value}</span>
    if (v === 'no' || v === 'loss') return <span className="badge-no">{value}</span>
    if (v === 'skip') return <span className="badge-skip">{value}</span>
    if (v === 'pending') return <span className="badge-pending">{value}</span>
  }
  return <span className="badge-skip">{value}</span>
}
