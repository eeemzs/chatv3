import type { CSSProperties, ReactNode } from 'react'

/**
 * Minimal app-shell primitives — the COMPLETE ./ui surface by contract:
 * three-column layout, panel, row. New primitives require a contract
 * revision (light-client-core-contract.md scope guard), not a quiet PR.
 * Visual identity (hover states, active colors) stays in consumer CSS via
 * className; these primitives own structure only.
 */

export type ThreeColumnLayoutProps = {
  nav: ReactNode
  main: ReactNode
  aside: ReactNode
  navWidth?: string
  asideWidth?: string
  className?: string
}

export function ThreeColumnLayout(props: ThreeColumnLayoutProps) {
  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${props.navWidth ?? '240px'} 1fr ${props.asideWidth ?? '280px'}`,
    height: '100vh',
  }
  return (
    <div className={props.className} style={style}>
      {props.nav}
      {props.main}
      {props.aside}
    </div>
  )
}

export type PanelProps = {
  /** which edge carries the divider toward the main column */
  side?: 'left' | 'right'
  className?: string
  children?: ReactNode
}

export function Panel(props: PanelProps) {
  const style: CSSProperties = {
    background: 'var(--surface)',
    overflowY: 'auto',
    ...(props.side === 'left' ? { borderRight: '1px solid var(--border)' } : {}),
    ...(props.side === 'right' ? { borderLeft: '1px solid var(--border)' } : {}),
  }
  return (
    <aside className={props.className} style={style}>
      {props.children}
    </aside>
  )
}

export type RowProps = {
  className?: string
  onClick?: () => void
  children?: ReactNode
}

export function Row(props: RowProps) {
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 'var(--row-h)',
    padding: '0 var(--gutter)',
    ...(props.onClick ? { cursor: 'pointer' } : {}),
  }
  return (
    <div className={props.className} style={style} onClick={props.onClick}>
      {props.children}
    </div>
  )
}
